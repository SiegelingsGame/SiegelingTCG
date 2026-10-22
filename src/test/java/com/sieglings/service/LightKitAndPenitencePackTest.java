package com.sieglings.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sieglings.model.Ability;
import com.sieglings.model.AbilityEffectKeys;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LightKitAndPenitencePackTest {

    private static final String LIGHT_PACK = "cards/content-packs/light-kit.json";
    private static final String PENITENCE_PACK = "cards/content-packs/penitence-signature.json";
    private static final Set<String> LIGHT_THEME_EFFECTS = Set.of(
            AbilityEffectKeys.HEAL, AbilityEffectKeys.CONNECTED_ALLIES_HEAL, AbilityEffectKeys.OVERHEAL,
            AbilityEffectKeys.HEALTH_BOOST, AbilityEffectKeys.CONNECTED_ALLIES_HEALTH_BOOST);
    // Live dashboard ids and the loadout size each rarity gets.
    private static final Map<String, Integer> EXPECTED_MOVE_COUNTS = Map.of(
            "glowbear", 3, "glowy", 5, "patience", 5, "penitence", 5);

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void bothPacksMergeIntoTheLiveShapedSnapshotValidateAndResolve() throws Exception {
        ContentPackMerger.Result light = ContentPackMerger.merge(mapper, liveShapedSnapshot(),
                ContentPackMerger.loadClasspathPack(mapper, LIGHT_PACK));
        ContentPackMerger.Result both = ContentPackMerger.merge(mapper, light.data(),
                ContentPackMerger.loadClasspathPack(mapper, PENITENCE_PACK));
        assertTrue(light.missingPatchIds().isEmpty(), "Light patch targets: " + light.missingPatchIds());
        assertTrue(both.missingPatchIds().isEmpty(), "Penitence patch target: " + both.missingPatchIds());
        assertEquals(3, light.cardsPatched());
        assertEquals(1, both.cardsPatched());

        ManualSieglingCatalog.OverrideFile file = mapper.treeToValue(both.data(), ManualSieglingCatalog.OverrideFile.class);
        ManualSieglingCatalog.validateDefinitions(file);

        MovesPoolService pool = new MovesPoolService(mapper, null);
        pool.reloadClasspathAndOverlayEditor(file.moves());
        int checked = 0;
        for (ManualSieglingCatalog.ManualSieglingDefinition card : file.cards()) {
            Integer want = EXPECTED_MOVE_COUNTS.get(card.id());
            if (want == null) {
                continue;
            }
            List<Ability> abilities = pool.resolveAbilities(card.moveIds());
            assertEquals(want, abilities.size(), "every move id resolves for " + card.id());
            checked++;
        }
        assertEquals(EXPECTED_MOVE_COUNTS.size(), checked);

        assertSignature(pool, file, "patience", "Everdawn", AbilityEffectKeys.OVERHEAL);
        assertSignature(pool, file, "penitence", "Penance", AbilityEffectKeys.DRAIN);
    }

    @Test
    void lightMovesStayOnThemeAndPayLightEnergy() {
        JsonNode pack = ContentPackMerger.loadClasspathPack(mapper, LIGHT_PACK);
        for (JsonNode move : pack.get("moves")) {
            String id = move.get("id").asText();
            assertEquals("LIGHT", move.get("element").asText(), id);
            assertTrue(LIGHT_THEME_EFFECTS.contains(move.get("effectType").asText()), id);
            // A null requiredElement makes the battle engine charge the card's own (Light) pool.
            assertTrue(move.get("requiredElement").isNull(), id);
        }
    }

    private void assertSignature(MovesPoolService pool, ManualSieglingCatalog.OverrideFile file,
                                 String cardId, String moveName, String effectKey) {
        ManualSieglingCatalog.ManualSieglingDefinition card = file.cards().stream()
                .filter(c -> cardId.equals(c.id())).findFirst().orElseThrow();
        Ability signature = pool.resolveAbilities(card.moveIds()).stream()
                .filter(a -> moveName.equals(a.getName())).findFirst().orElseThrow();
        assertEquals(effectKey, signature.getEffectType());
        long holders = file.cards().stream()
                .filter(c -> c.moveIds() != null)
                .filter(c -> pool.resolveAbilities(c.moveIds()).stream().anyMatch(a -> moveName.equals(a.getName())))
                .count();
        assertEquals(1, holders, moveName + " is unique to " + cardId);
    }

    /** The live Light/Shadow rows and the pre-existing moves the packs reference, as of October 2026. */
    private ObjectNode liveShapedSnapshot() {
        ObjectNode data = mapper.createObjectNode();
        ArrayNode cards = data.putArray("cards");
        addSiegling(cards, "glowbear", "Glowbear", "LIGHT", "COMMON", 15, 8, "glare");
        addSiegling(cards, "glowy", "Glowy", "LIGHT", "EPIC", 10, 5, "glare");
        addSiegling(cards, "patience", "Patience", "LIGHT", "LEGENDARY", 15, 20, "glare");
        addSiegling(cards, "penitence", "Penitence", "SHADOW", "LEGENDARY", 20, 15, "eclipse-pounce-balanced");

        ArrayNode moves = data.putArray("moves");
        addMove(moves, "glare", "Glare", "LIGHT", "ALL_ENEMIES", "damage", 2, 0);
        addMove(moves, "eclipse-pounce-balanced", "Eclipse Pounce", "SHADOW", "SINGLE_ENEMY", "damage", 8, 4);
        addMove(moves, "umbral-feint-balanced", "Umbral Feint", "SHADOW", "RANDOM_ENEMY", "damage", 4, 2);
        addMove(moves, "blackstar-scatter", "Blackstar Scatter", "SHADOW", "SPREAD_ALL", "damage", 12, 5);
        addMove(moves, "gloom-ward", "Gloom Ward", "SHADOW", "SINGLE_ALLY", "shield", 4, 2);
        return data;
    }

    private void addSiegling(ArrayNode cards, String id, String name, String element, String rarity,
                             int health, int speed, String moveId) {
        ObjectNode card = cards.addObject();
        card.put("type", "SIEGLING").put("id", id).put("name", name).put("element", element).put("rarity", rarity)
                .put("health", health).put("speed", speed).put("preferredRow", "BACK");
        card.putArray("moveIds").add(moveId);
    }

    private void addMove(ArrayNode moves, String id, String name, String element, String targetType,
                         String effectType, int value, int cost) {
        moves.addObject().put("id", id).put("name", name).put("element", element).put("category", "STANDARD")
                .put("targetType", targetType).put("effectType", effectType).put("effectValue", value)
                .put("energyCost", cost).put("isPassive", false);
    }
}
