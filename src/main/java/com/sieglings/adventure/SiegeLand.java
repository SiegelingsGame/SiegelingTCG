package com.sieglings.adventure;

import com.sieglings.model.enums.Element;
import java.util.*;

/** Server-owned biome rules. A land is rolled once per boss segment, never per request. */
record SiegeLand(String id, String name, String kind, List<Element> elements, NodeType feature,
                 String featureName, String terrain, String perk, String eventTitle, String eventPrompt) {
    static final List<SiegeLand> ALL = List.of(
        elemental("fire", "Emberfall", Element.FIRE, NodeType.SMITH, "Ember Forge", "Cinder heat", "ATTACK", "The Cinder Smith", "A soot-covered smith tends a forge fed by the mountain's heart."),
        elemental("ice", "Frostveil", Element.ICE, NodeType.REST, "Frost Shelter", "Glacial cover", "SHIELD", "The Frozen Waystation", "An icekeeper offers shelter beside a Siegeling trapped in frost."),
        elemental("wind", "Zephyr Reach", Element.WIND, NodeType.CARAVAN, "Sky Caravan", "Tailwinds", "SPEED", "The Sky Courier", "A courier's glider has landed beside a wind-carved arch."),
        elemental("earth", "Rootwild", Element.EARTH, NodeType.REST, "Root Refuge", "Living roots", "HEAL", "The Root Tender", "A forest keeper tends a wild Siegeling beneath the great roots."),
        elemental("water", "Tideglass", Element.WATER, NodeType.CARAVAN, "Tide Traders", "Healing tides", "HEAL", "The Tide Salvager", "A diver surfaces with a sealed chest from the drowned ruins."),
        elemental("electric", "Stormspire", Element.ELECTRIC, NodeType.EVENT, "Storm Beacon", "Charged air", "SPEED", "The Storm Chaser", "A lightning collector needs help grounding an overflowing crystal."),
        elemental("metal", "Ironhold", Element.METAL, NodeType.SMITH, "Iron Foundry", "Iron cover", "SHIELD", "The Foundry Keeper", "An old artificer offers a choice from the foundry's surviving stock."),
        elemental("shadow", "Gloamwood", Element.SHADOW, NodeType.BROKER, "Veil Broker", "Hidden blades", "ATTACK", "The Veiled Dealer", "A masked dealer whispers from between the violet trees."),
        elemental("undead", "Hollow March", Element.UNDEAD, NodeType.EVENT, "Grave Lantern", "Grave shelter", "SHIELD", "The Lantern Bearer", "A quiet spirit guards offerings left beside an ancient tomb."),
        elemental("psychic", "Dreamfold", Element.PSYCHIC, NodeType.EVENT, "Dream Oracle", "Foresight", "SPEED", "The Dream Weaver", "An oracle unfolds three possible futures in a floating crystal."),
        elemental("poison", "Venomfen", Element.POISON, NodeType.BROKER, "Fen Broker", "Venomous edge", "ATTACK", "The Fen Herbalist", "An herbalist gathers luminous fungi beside a watchful wild Siegeling."),
        elemental("light", "Dawnhaven", Element.LIGHT, NodeType.REST, "Dawn Sanctuary", "Restoring light", "HEAL", "The Dawn Pilgrim", "A pilgrim shares a warm sanctuary among the sunlit ruins."),
        new SiegeLand("obsidian", "Obsidian Grove", "RARE", List.of(Element.FIRE, Element.EARTH), NodeType.SMITH, "Rootfire Forge", "Rootfire", "ATTACK", "The Rootfire Artisan", "An artisan shapes living roots around a glowing obsidian relic."),
        new SiegeLand("aurora", "Aurora Expanse", "RARE", List.of(Element.ICE, Element.WIND), NodeType.EVENT, "Aurora Shrine", "Aurora winds", "SPEED", "The Aurora Watcher", "A watcher reads the lights above a drifting ice sanctuary."),
        new SiegeLand("relic", "Gilded Hollow", "RARE", List.of(), NodeType.TREASURE, "Relic Cache", "Buried riches", "GOLD", "The Vault Cartographer", "A cartographer has found an untouched vault beneath the golden ruins."),
        new SiegeLand("badlands", "The Badlands", "BADLANDS", List.of(), NodeType.ELITE, "Dread Siege", "Hostile ground", "BADLANDS", "The Ashbound Survivor", "A scarred survivor offers supplies bought at a terrible cost.")
    );

    private static SiegeLand elemental(String id, String name, Element element, NodeType feature, String featureName,
                                       String terrain, String perk, String title, String prompt) {
        return new SiegeLand(id, name, "ELEMENTAL", List.of(element), feature, featureName, terrain, perk, title, prompt);
    }
    static SiegeLand byId(String id) { return ALL.stream().filter(l -> l.id.equals(id)).findFirst().orElse(null); }
    boolean badlands() { return "BADLANDS".equals(kind); }
    boolean favors(Element e) { return elements.contains(e); }
    double goldMultiplier() { return "GOLD".equals(perk) ? 1.5 : badlands() ? 1.25 : 1; }
    String background() { return "/img/lands/" + id + ".webp"; }
    Map<String,String> locations() {
        Map<String,String> art = new LinkedHashMap<>();
        for (String scene : List.of("journey", "shelter", "elite", "boss"))
            art.put(scene, "/img/lands/locations/" + id + "-" + scene + ".webp");
        return art;
    }

    static SiegeLand roll(SiegeLand previous, int bosses, List<Element> active, Random rng) {
        String kind = "ELEMENTAL";
        if (bosses > 0) {
            int roll = rng.nextInt(100);
            int bad = Math.min(12, 5 + bosses * 2);
            int rare = Math.min(30, 14 + bosses * 4);
            kind = roll < bad ? "BADLANDS" : roll < bad + rare ? "RARE" : "ELEMENTAL";
        }
        final String category = kind;
        List<SiegeLand> eligible = ALL.stream().filter(l -> l != previous && l.kind.equals(category)
                && (active == null || active.containsAll(l.elements))).toList();
        if (eligible.isEmpty()) eligible = ALL.stream().filter(l -> l != previous && l.kind.equals("ELEMENTAL")
                && (active == null || active.containsAll(l.elements))).toList();
        // A single-element live catalog can still change land via the drop-based rare land.
        if (eligible.isEmpty()) return byId(previous != null && previous.id.equals("relic") ? "fire" : "relic");
        return eligible.get(rng.nextInt(eligible.size()));
    }

    /** Four tickets per matching candidate, one per other candidate; no forced drops. */
    int weight(Element element) { return favors(element) ? 4 : 1; }
    List<Element> weightedPalette(List<Element> base) {
        List<Element> out = new ArrayList<>();
        for (Element e : base) for (int i = 0; i < weight(e); i++) out.add(e);
        return out;
    }

    String effectText() {
        String who = elements.isEmpty() ? "Siegelings" : elements.stream().map(Enum::name).reduce((a,b) -> a + " / " + b).orElse("") + " Siegelings";
        return switch (perk) {
            case "ATTACK" -> who + " start battles with +1 Attack.";
            case "SHIELD" -> who + " start battles with +5 Shield.";
            case "SPEED" -> who + " gain +2 Speed for each battle.";
            case "HEAL" -> who + " recover 4 HP at battle start.";
            case "GOLD" -> "+50% earned gold; every battle offers an extra item choice.";
            default -> "Enemies have +25% HP and +15% damage. Earn +25% gold and choose a Badlands boon.";
        };
    }

    Map<String,Object> toMap() {
        Map<String,Object> m = new LinkedHashMap<>();
        m.put("id", id); m.put("name", name); m.put("kind", kind);
        m.put("elements", elements.stream().map(Enum::name).toList()); m.put("background", background());
        m.put("locations", locations());
        m.put("feature", featureName); m.put("featureType", feature.name());
        m.put("terrain", terrain); m.put("effect", effectText());
        m.put("encounters", elements.isEmpty() ? (badlands() ? "More elite encounters" : "More caches and relic rewards")
                : "Favored Siegelings have 4× draw weight in recruits, broker stock and card prizes.");
        m.put("eventTitle", eventTitle);
        return m;
    }

    /** Only the newly entered segment is themed; preserve ids, edges and boss/rest anchors. */
    void themeMap(SiegeRun run, int segment, Random rng) {
        for (int i = 0; i < run.getMap().size(); i++) {
            SiegeNode n = run.getMap().get(i);
            if (n.getRow() / SiegeContentService.SEGMENT_ROWS != segment || n.isCleared()) continue;
            int row = n.getRow() % SiegeContentService.SEGMENT_ROWS;
            NodeType type = n.getType();
            if ((row == 1 && n.getCol() == 0) || (row > 1 && row < SiegeContentService.SEGMENT_ROWS - 2
                    && type == NodeType.BATTLE && rng.nextInt(100) < 45)) type = feature;
            String label = type == feature ? featureName : n.getLabel();
            SiegeNode themed = new SiegeNode(n.getId(), n.getRow(), n.getCol(), type, label);
            themed.getNext().addAll(n.getNext()); run.getMap().set(i, themed);
        }
    }

    SiegeContentService.EventDef event() {
        var leave = new SiegeContentService.EventChoice("Continue onward", "NOTHING", 0, "You leave the sanctuary behind.");
        List<SiegeContentService.EventChoice> choices = switch (perk) {
            case "ATTACK", "BADLANDS" -> List.of(
                new SiegeContentService.EventChoice("Trade 8 party HP for a relic", "ITEM_HEALTHCOST", 8, "The bargain is sealed."),
                new SiegeContentService.EventChoice("Track a wild Siegeling", "RECRUIT_CHANCE", 0, "You follow its tracks."), leave);
            case "SHIELD", "HEAL" -> List.of(
                new SiegeContentService.EventChoice("Rest in the shelter", "HEAL", 16, "The land grants a moment of peace."),
                new SiegeContentService.EventChoice("Befriend the local Siegeling", "RECRUIT_CHANCE", 0, "You offer it a place in the warband."), leave);
            case "SPEED" -> List.of(
                new SiegeContentService.EventChoice("Buy foresight — 15 gold", "BLESS_SPEED", 15, "The path becomes clear."),
                new SiegeContentService.EventChoice("Carry a message — gain 20 gold", "GOLD", 20, "The courier pays for your help."), leave);
            default -> List.of(
                new SiegeContentService.EventChoice("Open the buried vault", "DIG_MAP", 0, "The vault opens."),
                new SiegeContentService.EventChoice("Sell the route — gain 35 gold", "GOLD", 35, "The map finds a buyer."), leave);
        };
        return new SiegeContentService.EventDef("land-" + id, eventTitle, badlands() ? "🌋" : "✦", eventPrompt, choices);
    }
}
