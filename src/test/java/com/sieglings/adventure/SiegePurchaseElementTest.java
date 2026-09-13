package com.sieglings.adventure;

import com.sieglings.model.Card;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.service.AccountService;
import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.PlayerProgressionService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Water and Electric Siegelings are sold, not handed out: a guest is never
 * offered them at warband assembly, and a signed-in player has to own the card
 * in their collection (premade deck, pack, shop) before the Siegecoin unlock is
 * even on the table. Everything here is driven through the real roster/newRun
 * gates, because those are the two places a locked pick can leak through.
 */
@SpringBootTest
class SiegePurchaseElementTest {

    @Autowired
    private SiegeService siegeService;

    @Autowired
    private SiegeContentService content;

    @Autowired
    private PlayerProgressionService progressionService;

    @Autowired
    private CardDefinitionService cardDefs;

    private SieglingCard purchaseSiegling() {
        return content.selectableSieglings().stream()
                .filter(content::isSiegePurchaseSiegling)
                .findFirst().orElse(null);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> rosterRow(Map<String, Object> roster, String id) {
        return ((List<Map<String, Object>>) roster.get("siegelings")).stream()
                .filter(m -> id.equals(m.get("id")))
                .findFirst().orElseThrow();
    }

    @Test
    void guestRosterLocksEveryWaterAndElectricSiegling() {
        Map<String, Object> roster = siegeService.roster(null);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) roster.get("siegelings");
        assertFalse(rows.isEmpty());
        boolean sawOne = false;
        for (Map<String, Object> row : rows) {
            SieglingCard card = content.findSiegling(String.valueOf(row.get("id"))).orElseThrow();
            if (!content.isSiegePurchaseSiegling(card)) {
                continue;
            }
            sawOne = true;
            assertEquals(Boolean.FALSE, row.get("expeditionStarter"), card.getName() + " must be locked for a guest");
            assertEquals(Boolean.TRUE, row.get("purchaseOnly"));
            // A guest has no collection to buy against, so no purchase is offered.
            assertEquals(Boolean.FALSE, row.get("canUnlock"));
            assertEquals("SIGN_IN", row.get("lockReason"));
            assertTrue((Integer) row.get("unlockCost") > 0, "a sold Siegeling needs a price");
        }
        assertTrue(sawOne, "catalog has no Water/Electric Siegelings to gate");
        // The free roster is untouched: other elements still cost nothing.
        Map<String, Object> free = rosterRow(roster,
                SiegeStarterTestSupport.freeSelectable(content).getFirst().getId());
        assertEquals(0, free.get("unlockCost"));
    }

    @Test
    void guestCannotStartARunWithAWaterOrElectricSiegling() {
        SieglingCard target = purchaseSiegling();
        assertNotNull(target, "catalog has no Water/Electric Siegelings to gate");
        TrainerCard knight = SiegeStarterTestSupport.starterKnight(content);
        List<String> warband = SiegeStarterTestSupport.starterIds(content, knight, target);

        IllegalArgumentException locked = assertThrows(IllegalArgumentException.class,
                () -> siegeService.newRun(null, knight.getId(), warband, "STANDARD"));
        assertTrue(locked.getMessage().contains("locked"), locked.getMessage());
    }

    @Test
    void signedInPlayerMustOwnTheCardBeforeTheUnlockIsOffered() throws Exception {
        SieglingCard target = purchaseSiegling();
        assertNotNull(target);
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setGold(100000);

        try (Swap ignored = withAccount(progression)) {
            Map<String, Object> row = rosterRow(siegeService.roster("Bearer test"), target.getId());
            assertEquals("OWN_CARD", row.get("lockReason"), "an unowned card cannot be bought for expeditions");
            assertEquals(Boolean.FALSE, row.get("canUnlock"));
            assertEquals(Boolean.FALSE, row.get("expeditionStarter"));

            // Owning the card turns the purchase on, but does not unlock the pick.
            progression.setOwnedCards(Map.of(target.getId(), 1));
            Map<String, Object> owned = rosterRow(siegeService.roster("Bearer test"), target.getId());
            assertEquals("BUY", owned.get("lockReason"));
            assertEquals(Boolean.TRUE, owned.get("canUnlock"));
            assertEquals(Boolean.FALSE, owned.get("expeditionStarter"));
        }
    }

    @Test
    void buyingTheUnlockChargesSiegecoinsAndMakesThePickLegal() throws Exception {
        SieglingCard target = purchaseSiegling();
        assertNotNull(target);
        int cost = content.siegeUnlockCost(target);
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setOwnedCards(Map.of(target.getId(), 1));
        progression.setGold(cost + 25);

        try (Swap ignored = withAccount(progression)) {
            Map<String, Object> result = siegeService.unlockSiegling("Bearer test", target.getId());

            assertEquals(Boolean.TRUE, result.get("ok"));
            assertEquals(25, progression.getGold(), "the unlock must charge exactly its price");
            assertTrue(progressionService.isSiegeSieglingUnlocked(progression, target.getId()));
            assertEquals(Boolean.TRUE, rosterRow(result, target.getId()).get("expeditionStarter"),
                    "the bought Siegeling becomes pickable immediately");
            // Buying twice is an error, not a second charge.
            assertThrows(IllegalArgumentException.class,
                    () -> siegeService.unlockSiegling("Bearer test", target.getId()));
            assertEquals(25, progression.getGold());
        }
    }

    @Test
    void aGuestCannotBuyAtAllAndAnUnownedCardIsRefusedBeforeAnyCoinsMove() throws Exception {
        SieglingCard target = purchaseSiegling();
        assertNotNull(target);
        assertThrows(IllegalArgumentException.class, () -> siegeService.unlockSiegling(null, target.getId()));

        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setGold(100000);
        try (Swap ignored = withAccount(progression)) {
            assertThrows(IllegalArgumentException.class,
                    () -> siegeService.unlockSiegling("Bearer test", target.getId()));
            assertEquals(100000, progression.getGold(), "a refused unlock must not spend Siegecoins");
        }
    }

    /**
     * Buying a premade deck only writes {@code purchasedDeckIds}. The Water/Electric
     * expedition rule asked for that shop path, so a purchased deck has to count
     * as owning the Siegelings it lists — otherwise the Unlock button never appears.
     */
    @Test
    void buyingAPremadeDeckCountsAsOwningItsSiegelings() throws Exception {
        DeckSeat seat = purchaseSieglingInAPurchasedDeck();
        assertNotNull(seat, "no Water/Electric Siegeling sits in a premade deck");
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        progression.setGold(100000);
        progression.setPurchasedDeckIds(List.of(seat.deckId));

        try (Swap ignored = withAccount(progression)) {
            assertTrue(progressionService.ownsCard(progression, seat.siegling.getId()),
                    seat.siegling.getName() + " must be owned via " + seat.deckId
                            + " even when ownedCards is empty");
            Map<String, Object> row = rosterRow(siegeService.roster("Bearer test"), seat.siegling.getId());
            assertEquals("BUY", row.get("lockReason"),
                    "the shop path has to offer the Siegecoin unlock");
            assertEquals(Boolean.TRUE, row.get("canUnlock"));
            assertEquals(Boolean.FALSE, row.get("expeditionStarter"));

            Map<String, Object> result = siegeService.unlockSiegling("Bearer test", seat.siegling.getId());
            assertEquals(Boolean.TRUE, result.get("ok"));
            assertTrue(progressionService.isSiegeSieglingUnlocked(progression, seat.siegling.getId()));
        }
    }

    /**
     * Meeting a sold Siegeling on the path must not bank it as a free starter —
     * otherwise one lucky recruit node routes around the shop entirely.
     */
    @Test
    void findingAPurchaseSieglingOnTheRunDoesNotBankItAsAStarter() throws Exception {
        SieglingCard target = purchaseSiegling();
        assertNotNull(target);
        PlayerProgressionEntity progression = new PlayerProgressionEntity();
        SiegeRun run = new SiegeRun("purchase-element-token");
        run.getDiscoveredSieglingIds().add(target.getId());

        java.lang.reflect.Method bank = SiegeService.class.getDeclaredMethod(
                "bankSieglingDiscoveries", PlayerProgressionEntity.class, SiegeRun.class);
        bank.setAccessible(true);
        @SuppressWarnings("unchecked")
        List<String> announced = (List<String>) bank.invoke(siegeService, progression, run);

        assertFalse(announced.contains(target.getName()));
        assertFalse(progressionService.isSiegeSieglingUnlocked(progression, target.getId()),
                "a Water/Electric find stays sold, not granted");
    }

    // ---- helpers ---------------------------------------------------------

    private record DeckSeat(String deckId, SieglingCard siegling) {}

    /**
     * A sold Siegeling that actually sits in a premade list. Generated decks do
     * not include every Water/Electric card, so the first catalog purchase
     * siegling is the wrong fixture for the shop-path test.
     */
    private DeckSeat purchaseSieglingInAPurchasedDeck() {
        PlayerProgressionEntity guest = new PlayerProgressionEntity();
        for (CardDefinitionService.DeckOption deck : cardDefs.getDeckOptions()) {
            // Skip decks that are already free: they would pass ownsCard without
            // touching purchasedDeckIds, which is the ledger this test is pinning.
            if (progressionService.isPremadeDeckUnlocked(guest, deck)) {
                continue;
            }
            List<Card> cards;
            try {
                cards = cardDefs.buildDeckById(deck.id());
            } catch (RuntimeException ignored) {
                continue;
            }
            for (Card card : cards) {
                if (!(card instanceof SieglingCard s) || !content.isSiegePurchaseSiegling(s)) {
                    continue;
                }
                if (content.findSiegling(s.getId()).isEmpty()) {
                    continue;
                }
                return new DeckSeat(deck.id(), s);
            }
        }
        return null;
    }

    /** Restores the real collaborators when the block exits. */
    private final class Swap implements AutoCloseable {
        private final Object accounts;
        private final Object progressions;
        private final Object store;

        Swap(Object accounts, Object progressions, Object store) {
            this.accounts = accounts;
            this.progressions = progressions;
            this.store = store;
        }

        @Override
        public void close() throws Exception {
            swapField("accountService", accounts);
            swapField("progressionService", progressions);
            swapField("progressionStore", store);
        }
    }

    /**
     * Signs a fake account in with the given progression. The real
     * PlayerProgressionService is kept (only its store lookup is bypassed), so the
     * ownership and unlock rules under test are the production ones.
     */
    private Swap withAccount(PlayerProgressionEntity progression) throws Exception {
        AccountService accounts = Mockito.mock(AccountService.class);
        AccountUser user = new AccountUser();
        user.setId("purchase-element-user");
        Mockito.when(accounts.findUser(ArgumentMatchers.anyString())).thenReturn(user);
        PlayerProgressionService progressions = Mockito.spy(progressionService);
        Mockito.doReturn(progression).when(progressions).getOrCreate(user);
        // The progression store is Firestore-backed and throws without credentials,
        // so the save at the end of a purchase is stubbed; the charge itself is
        // asserted on the entity.
        com.sieglings.persistence.firestore.PlayerProgressionStore store =
                Mockito.mock(com.sieglings.persistence.firestore.PlayerProgressionStore.class);
        Object realAccounts = swapField("accountService", accounts);
        Object realProgressions = swapField("progressionService", progressions);
        Object realStore = swapField("progressionStore", store);
        return new Swap(realAccounts, realProgressions, realStore);
    }

    private Object swapField(String name, Object value) throws Exception {
        java.lang.reflect.Field f = SiegeService.class.getDeclaredField(name);
        f.setAccessible(true);
        Object previous = f.get(siegeService);
        f.set(siegeService, value);
        return previous;
    }
}
