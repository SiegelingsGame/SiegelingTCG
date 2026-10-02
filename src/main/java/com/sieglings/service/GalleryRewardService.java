package com.sieglings.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import com.sieglings.persistence.entity.ProfileSettingsEntity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;

/**
 * Gallery art earned through achievements.
 *
 * <p>{@code catalog/gallery-rewards.json} maps a gallery piece id to the
 * achievement that unlocks it. A listed piece is locked until that achievement
 * is unlocked; any piece not listed - the element and place backdrops, and art
 * added later - is free. Locks apply wherever a player puts a piece on show:
 * profile backdrops ({@code profileArtId}, {@code pageArtId}) here on the
 * server, binder covers in the hub.
 */
@Service
public class GalleryRewardService {

    private static final String RESOURCE = "catalog/gallery-rewards.json";

    public record Reward(String achievementId, String achievement, String requirement) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record Table(Map<String, Reward> rewards) {}

    // Lazy for the same startup cycle PlayerTitleService documents: unlock state
    // is only consulted at request time.
    @Autowired
    @Lazy
    private AchievementEvaluationService achievementEvaluationService;

    @Autowired
    private ObjectMapper objectMapper;

    private volatile Map<String, Reward> rewards;

    public Map<String, Reward> rewards() {
        Map<String, Reward> loaded = rewards;
        if (loaded == null) {
            synchronized (this) {
                if (rewards == null) {
                    rewards = load();
                }
                loaded = rewards;
            }
        }
        return loaded;
    }

    public Optional<Reward> rewardFor(String pieceId) {
        if (pieceId == null || pieceId.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(rewards().get(pieceId.trim().toLowerCase(Locale.ROOT)));
    }

    /** Reward pieces this player has earned, from one evaluation of their achievements. */
    public Set<String> unlockedPieceIds(AccountUser user,
                                        PlayerProgressionEntity progression,
                                        ProfileSettingsEntity settings) {
        Set<String> pieces = new TreeSet<>();
        if (user == null || progression == null) {
            return pieces;
        }
        Set<String> needed = new TreeSet<>();
        rewards().values().forEach(reward -> needed.add(reward.achievementId()));
        Set<String> unlocked = achievementEvaluationService.unlockedAmong(user, needed, progression, settings);
        rewards().forEach((pieceId, reward) -> {
            if (unlocked.contains(reward.achievementId())) {
                pieces.add(pieceId);
            }
        });
        return pieces;
    }

    /** True for a free piece, an empty selection, or a reward this player has earned. */
    public boolean canUse(AccountUser user,
                          PlayerProgressionEntity progression,
                          ProfileSettingsEntity settings,
                          String pieceId) {
        Optional<Reward> reward = rewardFor(pieceId);
        if (reward.isEmpty()) {
            return true;
        }
        if (user == null || progression == null) {
            return false;
        }
        return achievementEvaluationService.isUnlocked(user, reward.get().achievementId(), progression, settings);
    }

    public Map<String, Object> serializeTable() {
        Map<String, Object> table = new LinkedHashMap<>();
        rewards().forEach((pieceId, reward) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("achievementId", reward.achievementId());
            row.put("achievement", reward.achievement());
            row.put("requirement", reward.requirement());
            table.put(pieceId, row);
        });
        return Map.of("rewards", table);
    }

    private Map<String, Reward> load() {
        try (InputStream stream = getClass().getClassLoader().getResourceAsStream(RESOURCE)) {
            if (stream == null) {
                return Map.of();
            }
            Table table = objectMapper.readValue(stream, Table.class);
            Map<String, Reward> out = new LinkedHashMap<>();
            if (table.rewards() != null) {
                table.rewards().forEach((pieceId, reward) -> {
                    if (pieceId != null && reward != null && reward.achievementId() != null) {
                        out.put(pieceId.trim().toLowerCase(Locale.ROOT), new Reward(
                                reward.achievementId().trim().toLowerCase(Locale.ROOT),
                                reward.achievement(),
                                reward.requirement()));
                    }
                });
            }
            return Collections.unmodifiableMap(out);
        } catch (IOException error) {
            throw new UncheckedIOException("Could not read " + RESOURCE, error);
        }
    }

    /** For tests: the achievement ids the table relies on. */
    List<String> achievementIds() {
        return rewards().values().stream().map(Reward::achievementId).distinct().sorted().toList();
    }
}
