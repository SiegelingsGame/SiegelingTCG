package com.sieglings.adventure;

import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Rarity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A hired mercenary is paid gold to fight the next battle, then leave. The
 * checkpoint used to omit it entirely, so a Cloud Run recycle after leaving
 * the broker ate the hire, and a recycle mid-battle promoted the merc into
 * the permanent warband because restore treated every player combatant as
 * a party member.
 */
class SiegeMercenaryCheckpointTest {

    private static final String KNIGHT_ID = "squire-bob";
    private static final String ALLY_SOURCE = "sproutling";
    private static final String MERC_ID = "merc-cindergil";

    private SiegeService service;
    private SiegeContentService content;

    @BeforeEach
    void setUp() throws Exception {
        service = new SiegeService();
        TrainerCard knight = new TrainerCard(KNIGHT_ID, "Squire Bob", Element.FIRE, Rarity.COMMON,
                null, null, false);
        SieglingCard sprout = new SieglingCard(ALLY_SOURCE, "Sprout", Element.EARTH, Rarity.COMMON,
                10, 6, java.util.List.of(), null);
        content = new SiegeContentService() {
            @Override
            Optional<TrainerCard> findKnight(String id) {
                return KNIGHT_ID.equals(id) ? Optional.of(knight) : Optional.empty();
            }

            @Override
            Optional<SieglingCard> findAnySiegling(String id) {
                return ALLY_SOURCE.equals(id) ? Optional.of(sprout) : Optional.empty();
            }
        };
        setField(service, "content", content);
        SiegeCombatEngine engine = new SiegeCombatEngine();
        setField(engine, "content", content);
        setField(service, "engine", engine);
    }

    @Test
    void hiredMercenaryAndBoonCardsSurviveAMapSideCheckpointRoundTrip() throws Exception {
        SiegeRun live = mapRun();
        hireMerc(live);
        int partySize = live.getParty().size();
        int gold = live.getGold();
        int cardCount = live.getMercCards().size();

        SiegeRun restored = roundTrip(live);

        assertNotNull(restored.getMercenary(), "the hire must still be under contract");
        assertEquals(MERC_ID, restored.getMercenary().getId());
        assertEquals("Cindergil (Merc)", restored.getMercenary().getName());
        assertEquals(cardCount, restored.getMercCards().size(),
                "boon cards have to ride along or the next battle is a body with no kit");
        assertEquals("boon-warcry", restored.getMercCards().getFirst().getSpec().id());
        assertEquals(partySize, restored.getParty().size(), "a rental is not a warband slot");
        assertTrue(restored.getParty().stream().noneMatch(c -> MERC_ID.equals(c.getId())));
        assertEquals(gold, restored.getGold(), "the gold already spent must not come back");
    }

    @Test
    void midBattleRestoreMustNotPromoteTheMercenaryIntoTheParty() throws Exception {
        SiegeRun live = mapRun();
        Combatant merc = hireMerc(live);
        int partySize = live.getParty().size();

        SiegeBattle battle = new SiegeBattle(NodeType.BATTLE);
        battle.setPhase(BattlePhase.PLAYER_INPUT);
        battle.setRoundNumber(1);
        battle.getCombatants().add(live.getParty().getFirst());
        battle.getCombatants().add(live.getKnightUnit());
        battle.getCombatants().add(merc);
        Combatant foe = new Combatant("foe-1", "Ember Fiend", Element.FIRE, Side.ENEMY, 40, 8, null);
        battle.getCombatants().add(foe);
        live.setBattle(battle);

        SiegeRun restored = roundTrip(live);

        assertNotNull(restored.getBattle(), "the fight itself must resume");
        assertNotNull(restored.getMercenary(), "the contract is still live mid-fight");
        assertEquals(MERC_ID, restored.getMercenary().getId());
        assertEquals(partySize, restored.getParty().size(),
                "restoring from battle combatants must not absorb the rental into the warband");
        assertTrue(restored.getParty().stream().noneMatch(c -> MERC_ID.equals(c.getId())));
        assertTrue(restored.getBattle().getCombatants().stream().anyMatch(c -> MERC_ID.equals(c.getId())),
                "the merc is still standing in the fight");
        assertEquals(restored.getMercenary(), restored.getBattle().findCombatant(MERC_ID),
                "the run-level merc must be the same object the engine is mutating");
    }

    private SiegeRun mapRun() {
        SiegeRun run = new SiegeRun("merc-cp");
        run.setKnightId(KNIGHT_ID);
        run.setKnightName("Squire Bob");
        Combatant knight = content.toKnightCombatant(
                content.findKnight(KNIGHT_ID).orElseThrow());
        run.setKnightUnit(knight);
        Combatant ally = new Combatant("ally-0-sproutling", "Sprout", Element.EARTH, Side.PLAYER, 60, 6, null);
        ally.setSourceCardId(ALLY_SOURCE);
        ally.setBaseMaxHp(60);
        ally.setPosition(0);
        run.getParty().add(ally);
        run.setGold(80);
        return run;
    }

    private Combatant hireMerc(SiegeRun run) {
        Combatant merc = new Combatant(MERC_ID, "Cindergil (Merc)", Element.FIRE, Side.PLAYER, 80, 10, null);
        merc.setArtCardId("cindergil");
        AbilitySpec boon = new AbilitySpec("boon-warcry", "Boon: Warcry", Element.FIRE, Effect.BUFF_ATK, 3,
                TargetKind.ALLY_ALL, 1, "Rallies the warband.", null, 0, AmpRider.NONE, 0, 3);
        run.setMercenary(merc);
        run.getMercCards().clear();
        run.getMercCards().add(new SiegeCard(MERC_ID + "-boon-war", MERC_ID, boon));
        run.addGold(-55);
        return merc;
    }

    @SuppressWarnings("unchecked")
    private SiegeRun roundTrip(SiegeRun live) throws Exception {
        Method snapshot = SiegeService.class.getDeclaredMethod("snapshotRun", SiegeRun.class);
        snapshot.setAccessible(true);
        Map<String, Object> snap = (Map<String, Object>) snapshot.invoke(service, live);
        Method restore = SiegeService.class.getDeclaredMethod("restoreRun", String.class, Map.class);
        restore.setAccessible(true);
        Optional<SiegeRun> restored = (Optional<SiegeRun>) restore.invoke(
                service, live.getToken() + "-resume", snap);
        assertTrue(restored.isPresent(), "checkpoint restore must succeed");
        return restored.get();
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }
}
