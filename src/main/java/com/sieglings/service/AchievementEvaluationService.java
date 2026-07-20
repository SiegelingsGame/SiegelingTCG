package com.sieglings.service;

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
            "FIRE", "ICE", "WATER", "EARTH", "WIND", "SHADOW", "ELECTRIC", "METAL", "UNDEAD", "PSYCHIC"
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
            case "first_win" -> ctx.wins() >= 1;
            case "duelist" -> ctx.totalMatches() >= 10;
            case "brawler" -> ctx.totalMatches() >= 25;
            case "veteran" -> ctx.totalMatches() >= 50;
            case "war_journal" -> ctx.totalMatches() >= 100;
            case "eternal_duelist" -> ctx.totalMatches() >= 200;
            case "champion" -> ctx.wins() >= 25;
            case "warlord" -> ctx.wins() >= 50;
            case "siege_legend" -> ctx.wins() >= 100;
            case "win_streak_3" -> ctx.bestStreak() >= 3;
            case "win_streak_5" -> ctx.bestStreak() >= 5;
            case "win_streak_7" -> ctx.bestStreak() >= 7;
            case "win_streak_10" -> ctx.bestStreak() >= 10;
            case "online_streak_3" -> ctx.onlineWinStreak() >= 3;
            case "solo_streak_3" -> ctx.soloWinStreak() >= 3;
            case "tactician" -> ctx.totalMatches() >= 20 && ctx.winRate() >= 50;
            case "profile_ready" -> ctx.hasProfileTitle() && ctx.hasBio();
            case "siegecoin_hoarder" -> ctx.gold() >= 1000;
            case "siegecoin_tycoon" -> ctx.gold() >= 5000;
            case "siegecoin_magnate" -> ctx.gold() >= 10000;
            case "mission_claim" -> ctx.missionsClaimed() >= 1;
            case "mission_habit" -> ctx.missionsClaimed() >= 5;
            case "mission_master" -> ctx.missionsCompleted() >= 10;
            case "signed_in" -> ctx.starterChosen();
            case "friend_link" -> ctx.friendCount() >= 1;
            case "friend_circle" -> ctx.friendCount() >= 5;
            case "element_avatar" -> ctx.avatarElement();
            case "portrait_upload" -> ctx.hasAvatarUrl();
            case "favorite_siegling" -> ctx.hasFavoriteSiegling();
            case "shop_regular" -> ctx.purchasedOffers() >= 3;
            case "element_specialist" -> ctx.mostCollectedElementCopies() >= 8;
            case "element_hoarder" -> ctx.mostCollectedElementCopies() >= 20;
            case "rainbow_binder" -> ctx.elementCount() >= 4;
            case "rainbow_six" -> ctx.elementCount() >= 6;
            case "rainbow_eight" -> ctx.elementCount() >= 8;
            case "rainbow_master" -> ctx.elementCount() >= 10;
            case "favorite_element_win" -> ctx.favoriteElementWins() >= 5;
            case "favorite_element_legend" -> ctx.favoriteElementWins() >= 15;
            case "fire_spark" -> ctx.elementUnique("FIRE") >= 1;
            case "fire_adept" -> ctx.elementUnique("FIRE") >= 5;
            case "fire_master" -> ctx.elementUnique("FIRE") >= 10;
            case "fire_victor" -> ctx.elementWins("FIRE") >= 3;
            case "earth_spark" -> ctx.elementUnique("EARTH") >= 1;
            case "earth_adept" -> ctx.elementUnique("EARTH") >= 5;
            case "earth_master" -> ctx.elementUnique("EARTH") >= 10;
            case "earth_victor" -> ctx.elementWins("EARTH") >= 3;
            case "wind_spark" -> ctx.elementUnique("WIND") >= 1;
            case "wind_adept" -> ctx.elementUnique("WIND") >= 5;
            case "wind_master" -> ctx.elementUnique("WIND") >= 10;
            case "wind_victor" -> ctx.elementWins("WIND") >= 3;
            case "water_spark" -> ctx.elementUnique("WATER") >= 1;
            case "water_adept" -> ctx.elementUnique("WATER") >= 5;
            case "water_master" -> ctx.elementUnique("WATER") >= 10;
            case "water_victor" -> ctx.elementWins("WATER") >= 3;
            case "ice_spark" -> ctx.elementUnique("ICE") >= 1;
            case "ice_adept" -> ctx.elementUnique("ICE") >= 5;
            case "ice_master" -> ctx.elementUnique("ICE") >= 10;
            case "ice_victor" -> ctx.elementWins("ICE") >= 3;
            case "shadow_spark" -> ctx.elementUnique("SHADOW") >= 1;
            case "shadow_adept" -> ctx.elementUnique("SHADOW") >= 5;
            case "shadow_master" -> ctx.elementUnique("SHADOW") >= 10;
            case "shadow_victor" -> ctx.elementWins("SHADOW") >= 3;
            case "electric_spark" -> ctx.elementUnique("ELECTRIC") >= 1;
            case "electric_adept" -> ctx.elementUnique("ELECTRIC") >= 5;
            case "electric_master" -> ctx.elementUnique("ELECTRIC") >= 10;
            case "electric_victor" -> ctx.elementWins("ELECTRIC") >= 3;
            case "metal_spark" -> ctx.elementUnique("METAL") >= 1;
            case "metal_adept" -> ctx.elementUnique("METAL") >= 5;
            case "metal_master" -> ctx.elementUnique("METAL") >= 10;
            case "metal_victor" -> ctx.elementWins("METAL") >= 3;
            case "undead_spark" -> ctx.elementUnique("UNDEAD") >= 1;
            case "undead_adept" -> ctx.elementUnique("UNDEAD") >= 5;
            case "undead_master" -> ctx.elementUnique("UNDEAD") >= 10;
            case "undead_victor" -> ctx.elementWins("UNDEAD") >= 3;
            case "psychic_spark" -> ctx.elementUnique("PSYCHIC") >= 1;
            case "psychic_adept" -> ctx.elementUnique("PSYCHIC") >= 5;
            case "psychic_master" -> ctx.elementUnique("PSYCHIC") >= 10;
            case "psychic_victor" -> ctx.elementWins("PSYCHIC") >= 3;
            case "collector_10" -> ctx.uniqueOwned() >= 10;
            case "collector_25" -> ctx.uniqueOwned() >= 25;
            case "collector_50" -> ctx.uniqueOwned() >= 50;
            case "collector_75" -> ctx.uniqueOwned() >= 75;
            case "collector_100" -> ctx.uniqueOwned() >= 100;
            case "copy_hoarder" -> ctx.ownedTotal() >= 30;
            case "copy_master" -> ctx.ownedTotal() >= 60;
            case "copy_barron" -> ctx.ownedTotal() >= 90;
            case "copy_titan" -> ctx.ownedTotal() >= 120;
            case "copy_colossus" -> ctx.ownedTotal() >= 150;
            case "rare_find" -> ctx.maxRarity() >= 3;
            case "epic_hunter" -> ctx.maxRarity() >= 4;
            case "legendary_pull" -> ctx.maxRarity() >= 5;
            case "uncommon_stack" -> ctx.rarityUnique("UNCOMMON") >= 10;
            case "rare_stack" -> ctx.rarityUnique("RARE") >= 8;
            case "epic_stack" -> ctx.rarityUnique("EPIC") >= 5;
            case "legendary_stack" -> ctx.rarityUnique("LEGENDARY") >= 3;
            case "set_quarter" -> ctx.completionPct() >= 25;
            case "set_half" -> ctx.completionPct() >= 50;
            case "set_three_quarter" -> ctx.completionPct() >= 75;
            case "set_complete" -> ctx.completionPct() >= 90;
            case "triple_threat" -> ctx.maxCopyCount() >= 3;
            case "triple_trio" -> ctx.tripleCopyCards() >= 3;
            case "triple_legion" -> ctx.tripleCopyCards() >= 10;
            case "siegling_squad" -> ctx.typeUnique("SIEGLING") >= 15;
            case "spell_archive" -> ctx.typeUnique("SPELL") >= 8;
            case "trap_network" -> ctx.typeUnique("TRAP") >= 8;
            case "trainer_belt" -> ctx.typeUnique("TRAINER") >= 3;
            case "first_pack" -> ctx.packOpens() >= 1;
            case "pack_regular" -> ctx.packOpens() >= 5;
            case "pack_veteran" -> ctx.packOpens() >= 15;
            case "pack_habit" -> ctx.packOpens() >= 25;
            case "pack_addict" -> ctx.packOpens() >= 40;
            case "pack_legend" -> ctx.packOpens() >= 60;
            case "remnant_pouch" -> ctx.remnants() >= 100;
            case "remnant_stash" -> ctx.remnants() >= 500;
            case "remnant_vault" -> ctx.remnants() >= 2000;
            case "remnant_tycoon" -> ctx.remnants() >= 5000;
            case "remnant_dynast" -> ctx.remnants() >= 10000;
            case "first_craft" -> ctx.crafts() >= 1;
            case "master_crafter" -> ctx.crafts() >= 5;
            case "forge_master" -> ctx.crafts() >= 10;
            case "grand_forge" -> ctx.crafts() >= 25;
            case "deck_builder" -> ctx.customDecks() >= 1;
            case "deck_architect" -> ctx.customDecks() >= 3;
            case "deck_curator" -> ctx.customDecks() >= 5;
            case "deck_library" -> ctx.customDecks() >= 10;
            case "deck_archive" -> ctx.customDecks() >= 15;
            case "planner_unlock" -> ctx.customDeckUnlocked();
            case "premade_owner" -> ctx.purchasedDeckIds() >= 1;
            case "premade_collector" -> ctx.purchasedDeckIds() >= 3;
            case "premade_curator" -> ctx.purchasedDeckIds() >= 5;
            case "premade_arsenal" -> ctx.purchasedDeckIds() >= 8;
            case "loadout_shelf" -> ctx.savedDecks() >= 1;
            case "loadout_rack" -> ctx.savedDecks() >= 5;
            case "trainer_ready" -> ctx.trainerDeckCount() >= 1;
            case "trainer_corps" -> ctx.trainerDeckCount() >= 3;
            case "arena_regular" -> ctx.pvpWins() >= 1;
            case "pvp_duelist" -> ctx.pvpWins() >= 5;
            case "pvp_veteran" -> ctx.pvpWins() >= 15;
            case "pvp_champion" -> ctx.pvpWins() >= 30;
            case "pvp_warlord" -> ctx.pvpWins() >= 50;
            case "lobby_runner" -> ctx.pvpMatches() >= 10;
            case "solo_striker" -> ctx.soloWins() >= 5;
            case "solo_veteran" -> ctx.soloWins() >= 15;
            case "solo_master" -> ctx.soloWins() >= 30;
            case "premade_victory" -> ctx.premadeWins() >= 1;
            case "premade_master" -> ctx.premadeWins() >= 10;
            case "premade_legend" -> ctx.premadeWins() >= 25;
            case "custom_victory" -> ctx.customWins() >= 1;
            case "custom_master" -> ctx.customWins() >= 10;
            case "custom_legend" -> ctx.customWins() >= 25;
            case "arena_grinder" -> ctx.wins() >= 20;
            case "arena_commander" -> ctx.wins() >= 75;
            case "arena_sovereign" -> ctx.wins() >= 150;
            case "siege_initiate" -> ctx.siegeRuns() >= 1;
            case "siege_explorer" -> ctx.siegeRuns() >= 10;
            case "siege_conqueror" -> ctx.siegeWins() >= 1;
            case "siege_champion" -> ctx.siegeWins() >= 10;
            case "siege_warlord" -> ctx.siegeWins() >= 25;
            case "siege_boss_slayer" -> ctx.siegeBossKills() >= 5;
            case "siege_boss_hunter" -> ctx.siegeBossKills() >= 25;
            case "siege_boss_legend" -> ctx.siegeBossKills() >= 50;
            case "siege_pathfinder" -> ctx.siegeNodesCleared() >= 50;
            case "siege_trailblazer" -> ctx.siegeNodesCleared() >= 200;
            case "siege_high_score" -> ctx.siegeBestScore() >= 1000;
            case "siege_score_master" -> ctx.siegeBestScore() >= 5000;
            case "keep_founder" -> ctx.keepFounded();
            case "keep_first_timber" -> ctx.keepTimberCollected() >= 1;
            case "keep_timber_300" -> ctx.keepTimberCollected() >= 300;
            case "keep_timber_1000" -> ctx.keepTimberCollected() >= 1000;
            case "keep_restorer" -> ctx.keepProjectsCompleted() >= 1;
            case "keep_builder" -> ctx.keepProjectsCompleted() >= 2;
            case "keep_chronicler" -> ctx.keepLoreRead() >= 3;
            case "keep_lorekeeper" -> ctx.keepLoreRead() >= 6;
            case "keep_listener" -> ctx.keepConversationsCompleted() >= 1;
            case "keep_confidant" -> ctx.keepConversationsCompleted() >= 3;
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
                progression.getSiegeRuns(),
                progression.getSiegeWins(),
                progression.getSiegeBossKills(),
                progression.getSiegeNodesCleared(),
                progression.getSiegeBestScore(),
                progression.isKeepFounded(),
                progression.getKeepTimberCollected(),
                progression.getKeepProjectsCompleted(),
                progression.getKeepLoreRead(),
                progression.getKeepConversationsCompleted(),
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
            int siegeRuns,
            int siegeWins,
            int siegeBossKills,
            int siegeNodesCleared,
            int siegeBestScore,
            boolean keepFounded,
            int keepTimberCollected,
            int keepProjectsCompleted,
            int keepLoreRead,
            int keepConversationsCompleted,
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
