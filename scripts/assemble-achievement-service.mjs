import fs from 'fs';

const switchBody = fs.readFileSync('scripts/generated-achievement-switch.txt', 'utf8');

const java = `package com.sieglings.service;

import com.sieglings.model.Card;
import com.sieglings.model.enums.Rarity;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.MatchHistoryEntity;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.entity.ProfileSettingsEntity;
import com.sieglings.persistence.entity.SavedDeckEntity;
import com.sieglings.persistence.firestore.MatchHistoryStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class AchievementEvaluationService {

    private static final List<String> ELEMENT_NAMES = List.of(
            "FIRE", "EARTH", "WIND", "ICE", "WATER", "SHADOW", "ELECTRIC", "METAL", "UNDEAD", "PSYCHIC"
    );

    @Autowired
    private CardDefinitionService cardDefinitionService;

    @Autowired
    private MatchHistoryStore matchHistoryStore;

    @Autowired
    private SavedDeckService savedDeckService;

    @Autowired(required = false)
    private DailyMissionService dailyMissionService;

    public boolean isUnlocked(AccountUser user,
                              String achievementId,
                              PlayerProgressionEntity progression,
                              ProfileSettingsEntity settings) {
        if (achievementId == null || achievementId.isBlank()) {
            return false;
        }
        EvaluationContext ctx = buildContext(user, progression, settings);
        return evaluate(achievementId.trim().toLowerCase(Locale.ROOT), ctx);
    }

    private boolean evaluate(String achievementId, EvaluationContext ctx) {
        return switch (achievementId) {
${switchBody}
            default -> false;
        };
    }

    private EvaluationContext buildContext(AccountUser user,
                                           PlayerProgressionEntity progression,
                                           ProfileSettingsEntity settings) {
        Map<String, Integer> ownedCards = progression.getOwnedCards() == null ? Map.of() : progression.getOwnedCards();
        List<Card> catalog = cardDefinitionService.getDeckBuilderCatalog();
        Map<String, Card> catalogById = new HashMap<>();
        for (Card card : catalog) {
            catalogById.put(card.getId(), card);
        }

        Map<String, Integer> elementUnique = new HashMap<>();
        Map<String, Integer> elementCopies = new HashMap<>();
        Map<String, Integer> rarityUnique = new HashMap<>();
        Map<String, Integer> typeUnique = new HashMap<>();
        int maxRarity = 0;
        int maxCopyCount = 0;
        int tripleCopyCards = 0;
        int ownedTotal = 0;
        int uniqueOwned = 0;

        for (Map.Entry<String, Integer> entry : ownedCards.entrySet()) {
            int count = Math.max(0, entry.getValue());
            if (count <= 0) {
                continue;
            }
            uniqueOwned++;
            ownedTotal += count;
            Card card = catalogById.get(entry.getKey());
            if (card == null) {
                continue;
            }
            String element = card.getElement().name();
            String rarity = card.getRarity().name();
            String type = card.getCardType().name();
            elementUnique.merge(element, 1, Integer::sum);
            elementCopies.merge(element, count, Integer::sum);
            rarityUnique.merge(rarity, 1, Integer::sum);
            typeUnique.merge(type, 1, Integer::sum);
            maxRarity = Math.max(maxRarity, rarityRank(card.getRarity()));
            maxCopyCount = Math.max(maxCopyCount, count);
            if (count >= 3) {
                tripleCopyCards++;
            }
        }

        int catalogSize = Math.max(1, catalog.size());
        int completionPct = Math.min(100, Math.round((uniqueOwned * 100f) / catalogSize));
        int mostCollectedElementCopies = elementCopies.values().stream().mapToInt(Integer::intValue).max().orElse(0);

        List<MatchHistoryEntity> battles = user == null ? List.of()
                : matchHistoryStore.findAllByUserId(user.getId());
        int wins = 0;
        int losses = 0;
        int bestStreak = 0;
        int streak = 0;
        Map<String, Integer> elementWins = new HashMap<>();
        int pvpWins = 0;
        int pvpMatches = 0;
        int soloWins = 0;
        int premadeWins = 0;
        int customWins = 0;

        String favoriteElement = settings == null || settings.getFavoriteElement() == null
                ? "FIRE"
                : settings.getFavoriteElement().trim().toUpperCase(Locale.ROOT);

        List<SavedDeckEntity> savedDecks = user == null ? List.of() : savedDeckService.listDecks(user);
        Set<String> customNames = new HashSet<>();
        int customDecks = 0;
        int trainerDeckCount = 0;
        for (SavedDeckEntity deck : savedDecks) {
            if (isCustomDeck(deck)) {
                customDecks++;
                if (deck.getName() != null && !deck.getName().isBlank()) {
                    customNames.add(deck.getName().trim().toLowerCase(Locale.ROOT));
                }
            }
            if (deck.getTrainerId() != null && !deck.getTrainerId().isBlank()) {
                trainerDeckCount++;
            }
        }

        for (MatchHistoryEntity battle : battles) {
            boolean win = "WIN".equalsIgnoreCase(battle.getResult());
            String matchType = battle.getMatchType() == null ? "" : battle.getMatchType().trim().toUpperCase(Locale.ROOT);
            boolean online = matchType.contains("PVP") || matchType.contains("ONLINE") || matchType.contains("PLAYER");
            if (win) {
                wins++;
                streak++;
                bestStreak = Math.max(bestStreak, streak);
                String loadoutText = battle.getLoadoutLabel() == null ? "" : battle.getLoadoutLabel();
                if (loadoutText.isBlank() && battle.getTrainerName() != null) {
                    loadoutText = battle.getTrainerName();
                }
                String element = inferElementFromText(loadoutText, favoriteElement);
                elementWins.merge(element, 1, Integer::sum);
            } else if ("LOSS".equalsIgnoreCase(battle.getResult())) {
                losses++;
                streak = 0;
            }
            if (online) {
                pvpMatches++;
                if (win) {
                    pvpWins++;
                }
            } else if (win) {
                soloWins++;
            }
            if (win) {
                String loadout = battle.getLoadoutLabel() == null ? "" : battle.getLoadoutLabel().trim().toLowerCase(Locale.ROOT);
                if (customNames.contains(loadout) || loadout.contains("custom")) {
                    customWins++;
                } else if (!loadout.isBlank()) {
                    premadeWins++;
                }
            }
        }

        int favoriteElementWins = elementWins.getOrDefault(favoriteElement, 0);
        int totalMatches = wins + losses;
        int winRate = totalMatches == 0 ? 0 : Math.round((wins * 100f) / totalMatches);

        int missionsClaimed = 0;
        int missionsCompleted = 0;
        if (dailyMissionService != null && user != null) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> missions = (List<Map<String, Object>>) dailyMissionService.getDailySnapshot(user).get("missions");
            if (missions != null) {
                for (Map<String, Object> mission : missions) {
                    if (Boolean.TRUE.equals(mission.get("claimed"))) {
                        missionsClaimed++;
                    }
                    if (Boolean.TRUE.equals(mission.get("completed"))) {
                        missionsCompleted++;
                    }
                }
            }
        }

        int friendCount = user == null || user.getFriendEmails() == null ? 0 : user.getFriendEmails().size();
        boolean starterChosen = progression.getStarterPackId() != null && !progression.getStarterPackId().isBlank();
        boolean customDeckUnlocked = ownedTotal >= PlayerProgressionService.CUSTOM_DECK_UNLOCK_COPIES;
        boolean avatarElement = settings != null && "ELEMENT".equalsIgnoreCase(String.valueOf(settings.getAvatarMode()));
        boolean hasAvatarUrl = settings != null && settings.getAvatarUrl() != null && !settings.getAvatarUrl().isBlank();
        boolean hasFavoriteSiegling = settings != null && settings.getFavoriteSiegling() != null && !settings.getFavoriteSiegling().isBlank();
        boolean hasBio = settings != null && settings.getBio() != null && !settings.getBio().isBlank();
        boolean hasProfileTitle = settings != null && settings.getPlayerTitle() != null && !settings.getPlayerTitle().isBlank();

        return new EvaluationContext(
                wins,
                totalMatches,
                winRate,
                bestStreak,
                progression.getOnlineWinStreak(),
                progression.getSoloWinStreak(),
                ownedTotal,
                uniqueOwned,
                completionPct,
                maxRarity,
                maxCopyCount,
                tripleCopyCards,
                progression.getPackHistory() == null ? 0 : progression.getPackHistory().size(),
                progression.getRemnants(),
                progression.getGold(),
                progression.getCraftCount(),
                customDecks,
                savedDecks.size(),
                trainerDeckCount,
                progression.getPurchasedDeckIds() == null ? 0 : progression.getPurchasedDeckIds().size(),
                progression.getPurchasedDailyOfferIds() == null ? 0 : progression.getPurchasedDailyOfferIds().size(),
                pvpWins,
                pvpMatches,
                soloWins,
                premadeWins,
                customWins,
                friendCount,
                missionsClaimed,
                missionsCompleted,
                elementUnique.size(),
                mostCollectedElementCopies,
                favoriteElementWins,
                starterChosen,
                customDeckUnlocked,
                avatarElement,
                hasAvatarUrl,
                hasFavoriteSiegling,
                hasProfileTitle,
                hasBio,
                elementUnique,
                elementWins,
                rarityUnique,
                typeUnique
        );
    }

    private boolean isCustomDeck(SavedDeckEntity deck) {
        String json = deck.getCustomDeckCardsJson();
        return json != null && !json.isBlank() && !"[]".equals(json);
    }

    private String inferElementFromText(String text, String fallback) {
        String value = text == null ? "" : text.toLowerCase(Locale.ROOT);
        for (String element : ELEMENT_NAMES) {
            if (value.contains(element.toLowerCase(Locale.ROOT))) {
                return element;
            }
        }
        if (value.contains("storm") || value.contains("electric")) {
            return "ELECTRIC";
        }
        if (value.contains("mech") || value.contains("metal")) {
            return "METAL";
        }
        return fallback == null || fallback.isBlank() ? "FIRE" : fallback.trim().toUpperCase(Locale.ROOT);
    }

    private int rarityRank(Rarity rarity) {
        return switch (rarity) {
            case COMMON -> 1;
            case UNCOMMON -> 2;
            case RARE -> 3;
            case EPIC -> 4;
            case LEGENDARY -> 5;
        };
    }

    private record EvaluationContext(
            int wins,
            int totalMatches,
            int winRate,
            int bestStreak,
            int onlineWinStreak,
            int soloWinStreak,
            int ownedTotal,
            int uniqueOwned,
            int completionPct,
            int maxRarity,
            int maxCopyCount,
            int tripleCopyCards,
            int packOpens,
            int remnants,
            int gold,
            int crafts,
            int customDecks,
            int savedDecks,
            int trainerDeckCount,
            int purchasedDeckIds,
            int purchasedOffers,
            int pvpWins,
            int pvpMatches,
            int soloWins,
            int premadeWins,
            int customWins,
            int friendCount,
            int missionsClaimed,
            int missionsCompleted,
            int elementCount,
            int mostCollectedElementCopies,
            int favoriteElementWins,
            boolean starterChosen,
            boolean customDeckUnlocked,
            boolean avatarElement,
            boolean hasAvatarUrl,
            boolean hasFavoriteSiegling,
            boolean hasProfileTitle,
            boolean hasBio,
            Map<String, Integer> elementUnique,
            Map<String, Integer> elementWins,
            Map<String, Integer> rarityUnique,
            Map<String, Integer> typeUnique
    ) {
        int elementUnique(String element) {
            return elementUnique.getOrDefault(element, 0);
        }

        int elementWins(String element) {
            return elementWins.getOrDefault(element, 0);
        }

        int rarityUnique(String rarity) {
            return rarityUnique.getOrDefault(rarity, 0);
        }

        int typeUnique(String type) {
            return typeUnique.getOrDefault(type, 0);
        }
    }
}
`;

fs.writeFileSync('src/main/java/com/sieglings/service/AchievementEvaluationService.java', java);
console.log('Wrote AchievementEvaluationService.java');
