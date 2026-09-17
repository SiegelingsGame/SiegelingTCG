package com.sieglings.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

/**
 * Shared passphrase in front of the card dashboard.
 *
 * <p>This is a <em>door</em>, not an identity. {@link CardEditorAuthService} stays the
 * thing that says who published what: it holds per-person admin accounts and is what
 * authorises a write. The gate exists because the dashboard page itself was reachable
 * by anyone who knew the URL, so the whole editing surface — every card, every deck,
 * every knight — was on display even though saving needed a login.
 *
 * <p>Two properties of the design are worth stating plainly, because they bound what
 * this can be trusted for:
 *
 * <ul>
 *   <li><b>The passphrase is never in the frontend bundle.</b> The page posts what the
 *       user typed and the server compares it against a bcrypt hash, so reading the
 *       JavaScript tells an attacker nothing.</li>
 *   <li><b>A gate in front of a static page is not a permission boundary.</b> The page
 *       is served by Firebase Hosting and its scripts are public; anyone can skip the
 *       UI and call the API directly. That is why the gate is <em>also</em> enforced on
 *       the write endpoints server-side, and why the admin login still guards them.
 *       The gate raises the floor; the admin account is the lock.</li>
 * </ul>
 *
 * <p>Tokens are HMAC-signed and stateless so any Cloud Run instance can verify one
 * without shared session storage.
 */
@Service
public class CardEditorGateService {

    /** Result of checking a passphrase or a token. */
    public record GateStatus(boolean configured, boolean unlocked) {}

    private static final Duration CLOCK_SKEW = Duration.ofMinutes(2);

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final String passphraseHash;
    private final long ttlHours;
    private final byte[] signingKey;

    public CardEditorGateService(
            // A bcrypt hash, never a plaintext passphrase: this file is in version
            // control. Override in the deployed environment to rotate.
            @Value("${app.card-editor.gate-hash:}") String passphraseHash,
            @Value("${app.card-editor.gate-ttl-hours:336}") long ttlHours,
            // Signing key for the unlock token. Left empty it is derived from the
            // hash, which is already a secret and already per-environment, so the
            // gate works with nothing else configured; set it to invalidate every
            // outstanding token at once.
            @Value("${app.card-editor.gate-token-secret:}") String tokenSecret
    ) {
        this.passphraseHash = passphraseHash == null ? "" : passphraseHash.trim();
        this.ttlHours = ttlHours > 0 ? ttlHours : 336;
        String key = (tokenSecret == null || tokenSecret.isBlank())
                ? "gate:" + this.passphraseHash
                : tokenSecret.trim();
        this.signingKey = key.getBytes(StandardCharsets.UTF_8);
    }

    /** True when a passphrase is configured at all. With none, the gate stands open. */
    public boolean isConfigured() {
        return !passphraseHash.isBlank();
    }

    public GateStatus describe(String token) {
        if (!isConfigured()) {
            return new GateStatus(false, true);
        }
        return new GateStatus(true, isValidToken(token));
    }

    /**
     * Checks a typed passphrase and, on success, mints an unlock token.
     *
     * @return the token, or null when the passphrase is wrong.
     */
    public String unlock(String passphrase) {
        if (!isConfigured()) {
            return issueToken();
        }
        if (passphrase == null || passphrase.isEmpty()) {
            return null;
        }
        if (!passwordEncoder.matches(passphrase, passphraseHash)) {
            return null;
        }
        return issueToken();
    }

    public boolean isValidToken(String token) {
        if (!isConfigured()) {
            return true;
        }
        if (token == null || token.isBlank()) {
            return false;
        }
        int dot = token.lastIndexOf('.');
        if (dot <= 0 || dot == token.length() - 1) {
            return false;
        }
        String expiryPart = token.substring(0, dot);
        String signaturePart = token.substring(dot + 1);
        long expiresAtEpochSecond;
        try {
            expiresAtEpochSecond = Long.parseLong(expiryPart);
        } catch (NumberFormatException ex) {
            return false;
        }
        if (Instant.now().minus(CLOCK_SKEW).getEpochSecond() > expiresAtEpochSecond) {
            return false;
        }
        String expected = sign(expiryPart);
        // Constant-time: a length-dependent or early-exit compare leaks the
        // signature one byte at a time to anyone willing to time the endpoint.
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                signaturePart.getBytes(StandardCharsets.UTF_8));
    }

    /** Hours a freshly minted token stays valid, for the client to schedule a re-prompt. */
    public long ttlHours() {
        return ttlHours;
    }

    private String issueToken() {
        String expiry = String.valueOf(Instant.now().plus(Duration.ofHours(ttlHours)).getEpochSecond());
        return expiry + "." + sign(expiry);
    }

    private String sign(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(signingKey, "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            // HmacSHA256 is mandatory on every JVM; if it is genuinely missing we
            // must not fall back to something weaker or to no signature at all.
            throw new IllegalStateException("Cannot sign the dashboard gate token.", ex);
        }
    }
}
