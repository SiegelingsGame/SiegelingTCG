package com.sieglings.gauntlet;

import com.sieglings.gauntlet.GauntletEncounters.Encounter;
import com.sieglings.gauntlet.GauntletEncounters.Kind;
import com.sieglings.gauntlet.GauntletRun.Phase;
import com.sieglings.model.Card;
import com.sieglings.model.CardInstance;
import com.sieglings.model.GameState;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.TrapCard;
import com.sieglings.service.GameService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
class GauntletServiceTest {

    @Autowired
    private GauntletService gauntlet;
    @Autowired
    private GauntletEncounters encounters;
    @Autowired
    private GameService gameService;

    private GauntletRun newRun() {
        return gauntlet.start(null, "Tester", "deck_fire_earth", "squire-bob");
    }

    @Test
    void draftIsTenBalancedCardsWithWholeEvolutionLines() {
        GauntletRun run = newRun();
        List<Card> deck = gauntlet.materializeDeck(run);
        assertEquals(GauntletRules.DRAFT_SIZE, deck.size());
        assertEquals(GauntletRules.DRAFT_SIEGLINGS, deck.stream().filter(SieglingCard.class::isInstance).count());
        assertEquals(GauntletRules.DRAFT_SPELLS, deck.stream().filter(SpellCard.class::isInstance).count());
        assertEquals(GauntletRules.DRAFT_TRAPS, deck.stream().filter(TrapCard.class::isInstance).count());
        Set<String> ids = deck.stream().map(Card::getId).collect(Collectors.toSet());
        for (Card card : deck) {
            if (card instanceof SieglingCard s && s.isEvolutionCard()) {
                assertTrue(ids.contains(s.getEvolvesFromId()), s.getName() + " needs its precursor in the draft");
            }
        }
        Set<String> elements = deck.stream().filter(SieglingCard.class::isInstance)
                .map(card -> card.getElement().name()).collect(Collectors.toSet());
        assertTrue(elements.containsAll(Set.of("FIRE", "EARTH")), "A dual-element deck drafts both halves: " + elements);
        assertEquals(Phase.DRAFT, run.phase);
    }

    @Test
    void openingFloorsAreTheSundileThenTheDracoPackAndTenIsAKnight() {
        Encounter first = encounters.forFloor(42L, 1, "squire-bob");
        assertEquals(Kind.WILD, first.kind());
        assertEquals(List.of("sundile"), first.deckIds(), "One Sundile, in hand: a lone foe.");
        assertNull(first.knightId());
        assertTrue(first.enemyHp() < 10, "The first wild Siegeling has only a little health.");

        Encounter second = encounters.forFloor(42L, 2, "squire-bob");
        assertEquals(Kind.PACK, second.kind());
        assertEquals(List.of("draco", "draco"), second.boardIds());

        Encounter boss = encounters.forFloor(42L, 10, "squire-bob");
        assertEquals(Kind.KNIGHT, boss.kind());
        assertEquals(30, boss.enemyHp());
        assertNotNull(boss.knightId());
        assertFalse(boss.knightId().equals("squire-bob"), "Never the player's own knight.");
        assertEquals(Kind.KNIGHT, encounters.forFloor(42L, 20, "squire-bob").kind());
        assertEquals(Kind.ELITE, encounters.forFloor(42L, 5, "squire-bob").kind());

        Encounter again = encounters.forFloor(42L, 7, "squire-bob");
        assertEquals(again, encounters.forFloor(42L, 7, "squire-bob"), "Same seed and floor, same encounter.");
    }

    @Test
    void battlesUseTheGauntletHealthAndAPreplacedPack() {
        GauntletRun run = newRun();
        gauntlet.begin(run.token);
        String solo = gauntlet.startBattle(run.token);
        GameState state = gameService.getSoloGame(solo);
        assertEquals(25, state.getPlayer().getMaxHealth());
        assertEquals(25, state.getPlayer().getHealth());
        assertEquals(GauntletRules.wildEnemyHp(1), state.getEnemy().getHealth());
        assertNull(state.getEnemy().getActiveTrainer(), "Wild fights have no SiegeKnight.");
        assertEquals(1, state.getGauntletFloor());
        assertTrue(state.isMatchHistoryRecorded(), "Gauntlet fights stay out of match history.");
        assertEquals(10, state.getPlayer().getHand().size() + state.getPlayer().getDeck().size());

        // Floor 2's Draco pack starts on the board.
        GameService.GauntletSide pack = gauntlet.enemySide(encounters.forFloor(run.seed, 2, run.knightId));
        assertEquals(2, pack.board().size());
    }

    @Test
    void winningPaysOutThenTheCampForgesAndShops() {
        GauntletRun run = newRun();
        gauntlet.begin(run.token);
        int goldBefore = run.gold;
        GameState state = gameService.getSoloGame(gauntlet.startBattle(run.token));
        state.getEnemy().setHealth(0);
        state.setGameOver(true);

        GauntletRun after = gauntlet.view(run.token);
        assertEquals(Phase.REWARD, after.phase);
        assertEquals(2, after.floor);
        assertTrue(after.gold > goldBefore);
        assertEquals(3, after.rewardOptions.size());
        String pick = after.rewardOptions.get(0);
        gauntlet.chooseReward(run.token, pick);
        assertEquals(11, after.deck.size());
        assertEquals(Phase.CAMP, after.phase);
        assertFalse(after.shop.isEmpty());

        GauntletRun.GauntletCard target = after.deck.get(0);
        List<GauntletRun.Upgrade> offer = gauntlet.forgeOffer(run.token, target.uid);
        assertEquals(offer, gauntlet.forgeOffer(run.token, target.uid), "Reopening the forge does not reroll.");
        after.gold = 500;
        gauntlet.forgeApply(run.token, target.uid, 0);
        assertEquals(2, target.level());
        assertEquals(500 - GauntletRules.forgeCost(1), after.gold);

        Map<String, Object> view = gauntlet.runView(after);
        assertNotNull(view.get("nextEncounter"));
        // Cards travel in the Battle Table's own JSON so the binder renderer can draw them,
        // with the forged copy's stats and the Gauntlet's fields on top.
        @SuppressWarnings("unchecked")
        Map<String, Object> forged = ((List<Map<String, Object>>) view.get("deck")).stream()
                .filter(card -> target.uid.equals(card.get("uid"))).findFirst().orElseThrow();
        assertEquals(2, forged.get("level"));
        // ...and the unforged printing beside it, which the tray strikes through.
        @SuppressWarnings("unchecked")
        Map<String, Object> printed = (Map<String, Object>) forged.get("base");
        assertNotNull(printed, "A forged card carries its unforged printing.");
        assertEquals(forged.get("id"), printed.get("id"));
        assertNotNull(forged.get("type"));
        assertTrue(forged.containsKey("moveIds") || !"SIEGLING".equals(forged.get("type")),
                "Siegelings carry the battle serializer's move ids.");
        assertEquals("CAMP", view.get("phase"));
    }

    @Test
    void losingCostsALifeAndTheFloorWaits() {
        GauntletRun run = newRun();
        gauntlet.begin(run.token);
        for (int lives = GauntletRules.STARTING_LIVES; lives > 0; lives--) {
            GameState state = gameService.getSoloGame(gauntlet.startBattle(run.token));
            gameService.forfeit(state, true);
            GauntletRun after = gauntlet.view(run.token);
            assertEquals(1, after.floor);
            assertEquals(lives - 1, after.lives);
        }
        assertEquals(Phase.OVER, run.phase);
        assertThrows(IllegalArgumentException.class, () -> gauntlet.startBattle(run.token));
    }

    @Test
    void aFightLostToARedeployReopensTheFloor() {
        GauntletRun run = newRun();
        gauntlet.begin(run.token);
        String first = gauntlet.startBattle(run.token);
        assertEquals(first, gauntlet.startBattle(run.token), "A live fight is resumed, not restarted.");
        run.battleToken = "gone-after-redeploy";
        String second = gauntlet.startBattle(run.token);
        assertNotNull(gameService.getSoloGame(second));
        assertEquals(GauntletRules.STARTING_LIVES, run.lives, "An interrupted fight costs nothing.");
    }

    @Test
    void knightLevelUpsOfferPerksThatChangeTheRun() {
        GauntletRun run = newRun();
        gauntlet.gainXp(run, GauntletRules.xpToNext(1));
        assertEquals(2, run.knightLevel);
        run.phase = Phase.REWARD;
        run.rewardOptions = List.of();
        gauntlet.chooseReward(run.token, null);
        assertEquals(Phase.LEVEL_UP, run.phase);
        String perk = run.perkOptions.contains("VITALITY") ? "VITALITY" : run.perkOptions.get(0);
        int hpBefore = run.maxHealth();
        gauntlet.choosePerk(run.token, perk);
        assertEquals(Phase.CAMP, run.phase);
        if (perk.equals("VITALITY")) {
            assertEquals(hpBefore + GauntletRules.VITALITY_HP, run.maxHealth());
        }
    }

    @Test
    void upgradedCopiesAreTellApartInHandByTheirSlot() {
        GauntletRun run = newRun();
        gauntlet.begin(run.token);
        GameState state = gameService.getSoloGame(gauntlet.startBattle(run.token));
        var hand = state.getPlayer().getHand();
        Card first = hand.get(0);
        Card twin = first instanceof SieglingCard s ? s.copy() : first;
        if (twin instanceof SieglingCard s) s.setHealth(s.getHealth() + 9);
        hand.add(twin);
        state.getPlayer().preferHandCopy(first.getId(), hand.size() - 1);
        assertTrue(hand.get(0) == twin, "The picked copy moves into the slot the engine reads first.");
    }
}
