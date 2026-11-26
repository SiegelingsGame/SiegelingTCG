package com.sieglings.campaign;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * Held items for campaign Siegelings. Each Siegeling holds one; the bonus is applied to
 * its unit when an Arena battle opens. Only buffs the Battle Table keeps through its
 * per-round recalculation are used: Shield, a permanent max-Health boost, and base Speed.
 */
public final class CampaignItems {

    private CampaignItems() {}

    public enum Kind { SHIELD, VITALITY, SPEED }

    public record Item(String id, String name, String icon, Kind kind, int value, String rarity) {
        public String effectText() {
            return switch (kind) {
                case SHIELD -> "+" + value + " Shield when the battle opens";
                case VITALITY -> "+" + value + " max Health in battle";
                case SPEED -> "+" + value + " Speed in battle";
            };
        }

        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", id);
            m.put("name", name);
            m.put("icon", icon);
            m.put("kind", kind.name());
            m.put("value", value);
            m.put("rarity", rarity);
            m.put("effect", effectText());
            return m;
        }
    }

    public static final List<Item> ALL = List.of(
            new Item("oak-charm", "Oak Charm", "🛡️", Kind.SHIELD, 2, "COMMON"),
            new Item("vital-seed", "Vital Seed", "🌱", Kind.VITALITY, 3, "COMMON"),
            new Item("swift-feather", "Swift Feather", "🪶", Kind.SPEED, 1, "COMMON"),
            new Item("ironbark-plate", "Ironbark Plate", "🪵", Kind.SHIELD, 4, "RARE"),
            new Item("heart-ember", "Heart Ember", "❤️‍🔥", Kind.VITALITY, 6, "RARE"),
            new Item("gale-spur", "Gale Spur", "🌀", Kind.SPEED, 2, "RARE"),
            new Item("sigil-aegis", "Sigil Aegis", "✴️", Kind.SHIELD, 6, "EPIC")
    );

    public static Item byId(String id) {
        if (id == null) return null;
        for (Item item : ALL) if (item.id().equals(id)) return item;
        return null;
    }

    /** A drop for a won battle: rarer kinds of fight roll from rarer tables. */
    public static Item roll(CampaignRun.ArenaKind kind, Random rng) {
        String rarity = switch (kind) {
            case WILD, RIVAL -> rng.nextInt(10) < 8 ? "COMMON" : "RARE";
            case KNIGHT -> rng.nextInt(10) < 3 ? "COMMON" : "RARE";
            case LEGENDARY, AKHAR -> rng.nextInt(10) < 6 ? "RARE" : "EPIC";
        };
        List<Item> pool = ALL.stream().filter(i -> i.rarity().equals(rarity)).toList();
        return pool.get(rng.nextInt(pool.size()));
    }
}
