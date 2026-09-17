package com.sieglings.service;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The real dashboard passphrase appears nowhere in this file. These tests hash a
 * throwaway passphrase of their own, so the suite proves the mechanism without
 * committing the secret it protects.
 */
class CardEditorGateServiceTest {

    private static final String PASSPHRASE = "test-only-passphrase";
    private static final String HASH = new BCryptPasswordEncoder().encode(PASSPHRASE);

    private static CardEditorGateService gate() {
        return new CardEditorGateService(HASH, 336, "unit-test-signing-key");
    }

    @Test
    void correctPassphraseMintsATokenThatValidates() {
        CardEditorGateService gate = gate();
        assertTrue(gate.isConfigured());
        String token = gate.unlock(PASSPHRASE);
        assertNotNull(token, "the right passphrase must open the gate");
        assertTrue(gate.isValidToken(token));
        assertTrue(gate.describe(token).unlocked());
        assertTrue(gate.describe(token).configured());
    }

    @Test
    void wrongOrMissingPassphraseIsRefused() {
        CardEditorGateService gate = gate();
        assertNull(gate.unlock("not-the-passphrase"));
        assertNull(gate.unlock(""));
        assertNull(gate.unlock(null));
        // Case and whitespace are not forgiven: bcrypt compares the bytes given.
        assertNull(gate.unlock(PASSPHRASE.toUpperCase()));
        assertNull(gate.unlock(" " + PASSPHRASE));
    }

    @Test
    void junkAndTamperedTokensAreRefused() {
        CardEditorGateService gate = gate();
        String token = gate.unlock(PASSPHRASE);
        assertFalse(gate.isValidToken(null));
        assertFalse(gate.isValidToken(""));
        assertFalse(gate.isValidToken("nonsense"));
        assertFalse(gate.isValidToken("9999999999.not-a-signature"));
        // The expiry is the signed payload, so pushing it out invalidates the signature.
        String[] parts = token.split("\\.", 2);
        assertFalse(gate.isValidToken((Long.parseLong(parts[0]) + 60000) + "." + parts[1]));
        // A truncated signature must not pass a prefix comparison.
        assertFalse(gate.isValidToken(parts[0] + "." + parts[1].substring(0, parts[1].length() - 1)));
    }

    /**
     * A token that is correctly signed but past its expiry must still be refused —
     * otherwise the TTL is decoration. Signed here with the same key the gate was
     * given, so the only thing wrong with it is the clock.
     */
    @Test
    void aCorrectlySignedButExpiredTokenIsRefused() throws Exception {
        CardEditorGateService gate = gate();
        String longExpired = String.valueOf(Instant.now().minus(Duration.ofDays(1)).getEpochSecond());
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("unit-test-signing-key".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String signature = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(mac.doFinal(longExpired.getBytes(StandardCharsets.UTF_8)));

        // Sanity: the signature itself is genuine — the same payload signed now passes.
        String live = String.valueOf(Instant.now().plus(Duration.ofHours(1)).getEpochSecond());
        String liveSignature = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(mac.doFinal(live.getBytes(StandardCharsets.UTF_8)));
        assertTrue(gate.isValidToken(live + "." + liveSignature), "the test must be signing the way the gate does");

        assertFalse(gate.isValidToken(longExpired + "." + signature), "an expired token must be refused");
    }

    @Test
    void tokensFromADifferentSecretAreRefused() {
        String token = gate().unlock(PASSPHRASE);
        CardEditorGateService rotated = new CardEditorGateService(HASH, 336, "a-different-signing-key");
        assertFalse(rotated.isValidToken(token), "rotating the secret must invalidate outstanding tokens");
    }

    @Test
    void anUnconfiguredGateStandsOpen() {
        // Local development with no hash set: the dashboard must still work.
        CardEditorGateService open = new CardEditorGateService("", 336, "");
        assertFalse(open.isConfigured());
        assertTrue(open.isValidToken(null));
        assertNotNull(open.unlock(null));
        assertFalse(open.describe(null).configured());
        assertTrue(open.describe(null).unlocked());
    }

    /**
     * The shipped default must be a bcrypt hash and nothing else. This is what stops
     * a plaintext passphrase being pasted into the properties file by mistake.
     */
    @Test
    void theShippedPropertyIsAHashNotAPassphrase() throws IOException {
        Properties props = new Properties();
        try (InputStream in = getClass().getResourceAsStream("/application.properties")) {
            assertNotNull(in, "application.properties must be on the test classpath");
            props.load(in);
        }
        String configured = props.getProperty("app.card-editor.gate-hash", "");
        assertTrue(configured.contains("CARD_DASHBOARD_GATE_HASH"),
                "the hash must stay overridable by environment variable so it can be rotated");
        String fallback = configured.substring(configured.indexOf(':') + 1, configured.lastIndexOf('}'));
        assertTrue(fallback.startsWith("$2a$") || fallback.startsWith("$2b$") || fallback.startsWith("$2y$"),
                "the committed default must be a bcrypt hash, not a passphrase: " + fallback);
        assertTrue(fallback.length() >= 59, "a bcrypt hash is 60 characters");
    }
}
