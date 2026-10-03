package com.sieglings.adventure;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import com.sieglings.service.CardOverrideStorageService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A free evolution (the Marshal Ultimate) used to leave the spent "Evolve: X"
 * card in hand. Every Siegeling now carries exactly one special card: the
 * Evolution card for its next stage, or — on a final form — its Signature
 * Ultimate, which is gauge-gated and once per battle.
 */
@SpringBootTest
class SiegeSignatureUltimateTest {

    @Autowired
    private SiegeContentService content;

    @Autowired
    private SiegeCombatEngine engine;

    @Test
    void marshalEvolutionTurnsTheStaleEvolveCardInHandIntoTheNextSpecialCard() {
        SiegeRun run = marshalRunWithEvolvingSiegling();
        if (run == null) return;
        SiegeBattle battle = run.getBattle();
        Combatant ally = firstAlly(battle);
        SiegeCard evoCard = specialCards(battle, ally.getId()).get(0);
        // Put the Evolution card in hand, as in the reported screenshot.
        battle.getDeck().remove(evoCard);
        battle.getDiscard().remove(evoCard);
        if (!battle.getHand().contains(evoCard)) battle.getHand().add(evoCard);

        int guard = 0;
        while (content.evolutionOf(firstAlly(battle).getSourceCardId()).isPresent() && guard++ < 4) {
            battle.setKnightCharge(SiegeBattle.KNIGHT_ULT_COST);
            assertTrue(engine.useKnightUltimate(run, new Random(guard)).ok);
            Combatant now = firstAlly(battle);
            List<SiegeCard> specials = specialCards(battle, now.getId());
            assertEquals(1, specials.size(), "exactly one special card survives each evolution");
            SiegeCard inHand = battle.getHand().stream()
                    .filter(c -> c.getInstanceId().equals(evoCard.getInstanceId())).findFirst().orElse(null);
            assertNotNull(inHand, "the stale card is rewritten in place, not dropped from the hand");
            assertFalse(inHand.getSpec().id().equals("evo:" + now.getSourceCardId()),
                    "no card offers to evolve into the form the Siegeling already has");
        }
        Combatant finalForm = firstAlly(battle);
        assertTrue(content.evolutionOf(finalForm.getSourceCardId()).isEmpty());
        SiegeCard sig = battle.getHand().stream()
                .filter(c -> c.getInstanceId().equals(evoCard.getInstanceId())).findFirst().orElseThrow();
        assertTrue(SiegeContentService.isSignature(sig.getSpec()), "a final form's card is its Signature Ultimate");
        assertTrue(sig.getSpec().name().startsWith(finalForm.getName()),
                "the default Signature is named after the individual Siegeling");
        assertTrue(battle.getHand().stream().noneMatch(c -> c.getSpec().effect() == Effect.EVOLVE
                        && c.getOwnerId().equals(finalForm.getId())),
                "no Evolve card is left for a fully evolved Siegeling");
    }

    @Test
    void signatureIsGaugeGatedAndOncePerBattle() {
        SiegeRun run = marshalRunWithEvolvingSiegling();
        if (run == null) return;
        SiegeBattle battle = run.getBattle();
        int guard = 0;
        while (content.evolutionOf(firstAlly(battle).getSourceCardId()).isPresent() && guard++ < 4) {
            battle.setKnightCharge(SiegeBattle.KNIGHT_ULT_COST);
            engine.useKnightUltimate(run, new Random(guard));
        }
        Combatant ally = firstAlly(battle);
        SiegeCard sig = specialCards(battle, ally.getId()).get(0);
        assertTrue(SiegeContentService.isSignature(sig.getSpec()));
        battle.getDeck().remove(sig);
        battle.getDiscard().remove(sig);
        if (!battle.getHand().contains(sig)) battle.getHand().add(sig);
        battle.setActionPoints(5);
        String target = sig.getSpec().needsExplicitTarget()
                ? battle.living(sig.getSpec().target() == TargetKind.ENEMY_SINGLE ? Side.ENEMY : Side.PLAYER)
                        .get(0).getId()
                : null;

        ally.setApSpent(0);
        assertFalse(engine.playCard(run, sig.getInstanceId(), target, new Random(3)).ok,
                "an empty gauge keeps the Signature locked");

        ally.setApSpent(SiegeBattle.EVOLVE_GAUGE);
        ally.applyStatus(StatusKind.CURSE, 2);
        assertFalse(engine.playCard(run, sig.getInstanceId(), target, new Random(3)).ok,
                "Curse blocks a final form's Signature as it blocks evolving");
        ally.clearStatus(StatusKind.CURSE);
        assertTrue(engine.playCard(run, sig.getInstanceId(), target, new Random(3)).ok);
        assertTrue(ally.isSignatureUsed());
        assertTrue(specialCards(battle, ally.getId()).isEmpty(), "the Signature is consumed, not discarded");
    }

    @Test
    void dashboardEditsLayerElementThenIndividual() {
        SiegeEffectTuningService tuning = inMemoryTuning();
        SiegeEffectTuningService.SignatureSpec builtIn = SiegeEffectTuningService.builtInSignature(Element.FIRE);
        SiegeEffectTuningService.SignatureSpec untouched = tuning.signatureFor(Element.FIRE, "fire-x", "Dracoil");
        assertEquals("Dracoil's " + builtIn.name(), untouched.name());
        assertEquals(builtIn.value(), untouched.value());

        tuning.applySignatureChanges(List.of(new SiegeEffectTuningService.SignaturePatch(
                "element:FIRE", Map.of("value", 12), false)), "editor@example.com");
        assertEquals(12, tuning.signatureFor(Element.FIRE, "fire-x", "Dracoil").value(),
                "a type edit reaches every Siegeling of that type");

        tuning.applySignatureChanges(List.of(new SiegeEffectTuningService.SignaturePatch(
                "fire-x", Map.of("name", "Coilstorm", "effect", "HEAL", "status", "NONE"), false)),
                "editor@example.com");
        SiegeEffectTuningService.SignatureSpec mine = tuning.signatureFor(Element.FIRE, "fire-x", "Dracoil");
        assertEquals("Coilstorm", mine.name());
        assertEquals(Effect.HEAL, mine.effect());
        assertEquals(TargetKind.ALLY_ALL, mine.target(), "a heal is re-aimed at the warband");
        assertEquals(12, mine.value(), "unedited fields still inherit the type row");
        assertEquals(null, mine.status());
        assertEquals(12, tuning.signatureFor(Element.FIRE, "fire-y", "Other").value());
        assertEquals(Effect.DAMAGE, tuning.signatureFor(Element.FIRE, "fire-y", "Other").effect(),
                "an individual edit stays with that individual");

        assertThrows(IllegalArgumentException.class, () -> tuning.applySignatureChanges(List.of(
                new SiegeEffectTuningService.SignaturePatch("fire-x", Map.of("target", "ALL_ENEMIES"), false)),
                "editor@example.com"), "a heal cannot be aimed at foes");
        assertThrows(IllegalArgumentException.class, () -> tuning.applySignatureChanges(List.of(
                new SiegeEffectTuningService.SignaturePatch("fire-x", Map.of("effect", "EVOLVE"), false)),
                "editor@example.com"));

        tuning.applySignatureChanges(List.of(new SiegeEffectTuningService.SignaturePatch("fire-x", Map.of(), true)),
                "editor@example.com");
        assertEquals(Effect.DAMAGE, tuning.signatureFor(Element.FIRE, "fire-x", "Dracoil").effect());
    }

    @Test
    void everyElementHasALegalBuiltInSignature() {
        for (Element element : Element.values()) {
            SiegeEffectTuningService.SignatureSpec spec = SiegeEffectTuningService.builtInSignature(element);
            assertNotNull(spec, element + " needs a Signature");
            assertTrue(SiegeEffectTuningService.targetFits(spec.effect(), spec.target()), element.name());
            assertTrue(SiegeEffectTuningService.SIGNATURE_EFFECTS.contains(spec.effect()), element.name());
        }
    }

    // ---- fixtures --------------------------------------------------------

    private SiegeRun marshalRunWithEvolvingSiegling() {
        TrainerCard knight = content.selectableKnights().stream()
                .filter(k -> content.knightPassiveKind(k) == KnightPassive.MARSHAL)
                .findFirst().orElse(null);
        SieglingCard starter = SiegeStarterTestSupport.freeSelectable(content).stream()
                .filter(s -> content.evolutionOf(s.getId()).isPresent())
                .findFirst().orElse(null);
        if (knight == null || starter == null) return null;
        SiegeRun run = new SiegeRun("t-sig");
        run.setKnightId(knight.getId());
        run.setKnightName(knight.getName());
        run.setKnightElement(knight.getElement());
        run.setKnightRarity(knight.getRarity());
        run.setKnightAccountLevel(1);
        run.setKnightPassive(KnightPassive.MARSHAL);
        run.setKnightPassiveValue(content.knightPassiveValue(KnightPassive.MARSHAL, 1, knight.getRarity()));
        run.setKnightUnit(content.toKnightCombatant(knight));
        Combatant member = content.toPartyCombatant(starter, 0);
        run.getParty().add(member);
        run.getDeckTemplates().addAll(content.deckCardsFor(starter, member.getId()));
        Random rng = new Random(7);
        engine.startBattle(run, NodeType.BATTLE,
                content.generateOpeningEnemies(rng, List.of(knight.getElement())), rng);
        return run;
    }

    private static Combatant firstAlly(SiegeBattle battle) {
        return battle.living(Side.PLAYER).stream().filter(c -> !c.isKnight()).findFirst().orElseThrow();
    }

    private static List<SiegeCard> specialCards(SiegeBattle battle, String ownerId) {
        List<SiegeCard> out = new ArrayList<>();
        for (List<SiegeCard> pile : List.of(battle.getHand(), battle.getDeck(), battle.getDiscard())) {
            for (SiegeCard c : pile) {
                if (c.getOwnerId().equals(ownerId) && (c.getSpec().effect() == Effect.EVOLVE
                        || SiegeContentService.isSignature(c.getSpec()))) out.add(c);
            }
        }
        return out;
    }

    private static SiegeEffectTuningService inMemoryTuning() {
        AtomicReference<SiegeEffectTuningService.TuningFile> holder =
                new AtomicReference<>(new SiegeEffectTuningService.TuningFile(List.of(), null, List.of()));
        return new SiegeEffectTuningService(new ObjectMapper(), null, "appConfig", "siegeEffectTuning") {
            @Override
            protected StoredData loadStored() {
                return new StoredData(holder.get(),
                        CardOverrideStorageService.StorageBackend.CLASSPATH_RESOURCE, null, null);
            }

            @Override
            protected StoredData saveStored(TuningFile file, String updatedByEmail) {
                holder.set(file);
                invalidateCache();
                return new StoredData(file,
                        CardOverrideStorageService.StorageBackend.CLASSPATH_RESOURCE, updatedByEmail, null);
            }
        };
    }
}
