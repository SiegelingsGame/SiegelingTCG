package com.sieglings.staticassets;

import com.sieglings.model.AbilityEffectKeys;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Firebase Hosting rewrites {@code /api/cards/editor} to the Firebase Function,
 * not to Spring (see {@code firebase.json}), so the live card dashboard never
 * reads {@link com.sieglings.service.CardOverrideEditorService}'s catalog — it
 * reads the hand-maintained copy in {@code functions/editorMetadata.js}. That
 * copy both populates the Effect dropdown and backs the save-time validation in
 * {@code functions/index.js}, so an effect key missing there is invisible in the
 * dashboard *and* rejected on save, while every backend test still passes.
 *
 * chain_damage shipped that way: supported everywhere in Java, absent from the
 * Function, so "Chain Damage" never appeared in the dropdown. This pins the two
 * lists together so the next new effect key cannot drift the same way.
 */
class FunctionsEditorMetadataParityTest {

    private static final Path EDITOR_METADATA_JS = Path.of("functions/editorMetadata.js");

    @Test
    void everySupportedEffectKeyIsPublishedByTheFirebaseFunctionCatalog() throws IOException {
        Set<String> functionKeys = readFunctionEffectKeys();

        List<String> missing = new ArrayList<>(AbilityEffectKeys.all());
        missing.removeAll(functionKeys);
        missing.sort(String::compareTo);

        assertTrue(
                missing.isEmpty(),
                "functions/editorMetadata.js is missing effect keys that AbilityEffectKeys supports: " + missing
                        + ". The dashboard reads its Effect dropdown from the Function, not from Spring, and "
                        + "functions/index.js rejects saves whose effectType is absent here — so a key missing "
                        + "from this file is unusable in the live dashboard."
        );
    }

    @Test
    void theFunctionCatalogDoesNotInventEffectKeysTheEngineCannotResolve() throws IOException {
        List<String> unknown = new ArrayList<>(readFunctionEffectKeys());
        unknown.removeAll(AbilityEffectKeys.all());
        unknown.sort(String::compareTo);

        assertTrue(
                unknown.isEmpty(),
                "functions/editorMetadata.js offers effect keys EffectService cannot resolve: " + unknown
                        + ". Saving one would write an override the battle engine silently ignores."
        );
    }

    /** Effect keys are the {@code key:} entries of the EFFECT_TYPES array only. */
    private static Set<String> readFunctionEffectKeys() throws IOException {
        String source = Files.readString(EDITOR_METADATA_JS);
        int start = source.indexOf("const EFFECT_TYPES = [");
        assertTrue(start >= 0, "functions/editorMetadata.js must declare EFFECT_TYPES.");
        int end = source.indexOf("\n];", start);
        assertTrue(end > start, "EFFECT_TYPES must be a closed array literal.");

        Matcher matcher = Pattern.compile("key:\\s*'([a-z_]+)'").matcher(source.substring(start, end));
        Set<String> keys = new LinkedHashSet<>();
        while (matcher.find()) {
            keys.add(matcher.group(1));
        }
        assertTrue(keys.size() > 1, "Expected the Function's effect catalog to parse into many keys.");
        return keys;
    }
}
