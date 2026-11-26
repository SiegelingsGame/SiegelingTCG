package com.sieglings.campaign;

import com.sieglings.adventure.SiegeLand;
import com.sieglings.model.enums.Element;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Static campaign tables: starters, realm knights, Akhar, formations. */
public final class CampaignContent {

    private CampaignContent() {}

    public record Starter(String cardId, String name, Element element, String landId, String blurb) {}

    public static final List<Starter> STARTERS = List.of(
            new Starter("sundile", "Sundile", Element.FIRE, "fire", "A sun-warmed hatchling from Emberfall."),
            new Starter("cacty", "Cacty", Element.EARTH, "earth", "A prickly companion from Rootwild."),
            new Starter("fawny", "Fawny", Element.ICE, "ice", "A frosted fawn from Frostveil."),
            new Starter("breezee", "Breezee", Element.WIND, "wind", "A playful breeze from Zephyr Reach.")
    );

    /** Realm SiegeKnight id per Land element id (SiegeLand elemental id). */
    public static final Map<String, String> REALM_KNIGHT_BY_LAND = Map.ofEntries(
            // Named campaign NPCs hold Fire / Wind / Ice; other realms keep roster knights.
            Map.entry("fire", "pyla"),
            Map.entry("earth", "trainer05"),
            Map.entry("wind", "ser-airek"),
            Map.entry("water", "trainer04"),
            Map.entry("ice", "glacia"),
            Map.entry("shadow", "trainer07"),
            Map.entry("electric", "trainer08"),
            Map.entry("metal", "trainer23"),
            Map.entry("undead", "trainer26"),
            Map.entry("psychic", "trainer29"),
            Map.entry("poison", "trainer32"),
            Map.entry("light", "trainer35")
    );

    /** Overworld SiegeKnight NPCs you meet in Sanctuary / their home realm. */
    public static final Map<String, String> SANCTUARY_NPC_KNIGHTS = Map.of(
            "pyla", "fire",
            "ser-airek", "wind",
            "glacia", "ice"
    );

    /** Rival (road) trainer per Land — squire-tier when available. */
    public static final Map<String, String> RIVAL_TRAINER_BY_LAND = Map.ofEntries(
            Map.entry("fire", "trainer01"),
            Map.entry("earth", "trainer12"),
            Map.entry("wind", "trainer14"),
            Map.entry("water", "trainer03"),
            Map.entry("ice", "trainer20"),
            Map.entry("shadow", "trainer16"),
            Map.entry("electric", "trainer18"),
            Map.entry("metal", "trainer22"),
            Map.entry("undead", "trainer25"),
            Map.entry("psychic", "trainer28"),
            Map.entry("poison", "trainer31"),
            Map.entry("light", "trainer34")
    );

    /** The Legendary guarding each element's shrine; beating it earns that element's Sigil. */
    public static final Map<String, String> LEGENDARY_BY_ELEMENT = Map.ofEntries(
            Map.entry("fire", "pylord"),
            Map.entry("ice", "glaciemperor"),
            Map.entry("wind", "aerovane"),
            Map.entry("earth", "gymstone"),
            Map.entry("water", "conchious"),
            Map.entry("electric", "new-siegli"),
            Map.entry("metal", "siegebot"),
            Map.entry("shadow", "penitence"),
            Map.entry("undead", "mors"),
            Map.entry("psychic", "gos"),
            Map.entry("poison", "toxsleaf"),
            Map.entry("light", "patience")
    );

    public static final String AKHAR_ID = "raidlord-akhar";
    public static final String SQUIRE_ID = "squire-bob";

    public static final int OFFICIAL_HP = 50;
    public static final int RIVAL_HP = 25;
    public static final int RALLIES_TO_UNLOCK_AKHAR = 4;

    /** Player-side placement cells for N=1..5 (row, col) on the player's 3×3 half. */
    public static final int[][] PLAYER_SLOTS = {{0, 1}, {0, 0}, {0, 2}, {1, 1}, {1, 0}};
    /** Enemy-side placement cells (mirror of Gauntlet pack slots). */
    public static final int[][] ENEMY_SLOTS = {{2, 1}, {2, 0}, {2, 2}, {1, 1}, {1, 0}};

    public static Starter starterById(String id) {
        if (id == null) return null;
        for (Starter s : STARTERS) {
            if (s.cardId().equalsIgnoreCase(id)) return s;
        }
        return null;
    }

    public static List<SiegeLand> elementalLands() {
        return SiegeLand.ALL.stream().filter(l -> "ELEMENTAL".equals(l.kind())).toList();
    }

    public static Map<String, Object> starterJson(Starter s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", s.cardId());
        m.put("name", s.name());
        m.put("element", s.element().name());
        m.put("landId", s.landId());
        m.put("blurb", s.blurb());
        SiegeLand land = SiegeLand.byId(s.landId());
        if (land != null) {
            m.put("landName", land.name());
            m.put("background", land.background());
        }
        return m;
    }

    /** Arena battles field at most three Siegelings a side, whatever the roster size. */
    public static int partySizeFor(CampaignRun.ArenaKind kind, int rosterSize) {
        return Math.min(CampaignRun.ARENA_PARTY_MAX, Math.max(1, rosterSize));
    }

    public static int playerHpFor(CampaignRun.ArenaKind kind) {
        return kind == CampaignRun.ArenaKind.RIVAL ? RIVAL_HP : OFFICIAL_HP;
    }
}
