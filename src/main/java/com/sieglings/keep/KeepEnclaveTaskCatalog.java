package com.sieglings.keep;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The tasks an Enclave resident offers in exchange for rapport.
 *
 * <p>Every Siegeling ends up with its own three-task ladder. Two rungs come from its element
 * (a Fire resident asks for forge work, a Psychic one asks you to sit and talk), and the third
 * is a personal bond task picked deterministically from the resident's card id, so two Fire
 * Siegelings in the same Enclave never offer an identical set. Designers can replace either
 * layer from the dashboard: {@code tasks.elements[ELEMENT]} swaps the element defaults and
 * {@code tasks.residents[cardId]} replaces one Siegeling's ladder outright.
 */
public final class KeepEnclaveTaskCatalog {

    /** A task the player can complete repeatedly; each completion pays rapport once. */
    public record TaskDefinition(String id, String event, int goal, String name, String description,
                                 int rapport, int gold, int remnants, String source) { }

    /** Progress buckets the Keep raises as the player acts. */
    public static final Set<String> EVENT_TYPES = Set.of(
            "TIMBER_COLLECTION", "MATERIAL_COLLECTION", "CRAFTING",
            "CONSTRUCTION", "DECORATION", "CONVERSATION");

    /** Reward and difficulty by rung, so a resident's ladder always escalates. */
    private static final int[] RUNG_RAPPORT = {2, 3, 5};
    private static final int[] RUNG_GOLD = {90, 140, 210};
    private static final int[] RUNG_REMNANTS = {20, 32, 48};

    private static final Map<String, List<TaskDefinition>> ELEMENT_TASKS = createElementTasks();
    private static final List<TaskDefinition> BOND_TASKS = createBondTasks();

    private KeepEnclaveTaskCatalog() { }

    /**
     * Resolves the three tasks a resident offers. Dashboard overrides win over the element
     * defaults, and a resident-specific override replaces the whole ladder.
     */
    public static List<TaskDefinition> tasksFor(KeepTuning tuning, String residentId,
                                                 String residentName, String element) {
        KeepTuning config = KeepTuning.orEmpty(tuning);
        String name = residentName == null || residentName.isBlank() ? "This Siegeling" : residentName.trim();
        List<KeepTuning.Task> residentOverride = config.residentTasks(residentId);
        if (!residentOverride.isEmpty()) {
            return personalize(fromTuning(residentOverride, "RESIDENT"), name);
        }
        List<TaskDefinition> out = new ArrayList<>();
        List<KeepTuning.Task> elementOverride = config.elementTasks(normalizeElement(element));
        if (!elementOverride.isEmpty()) {
            out.addAll(fromTuning(elementOverride, "ELEMENT"));
        } else {
            out.addAll(ELEMENT_TASKS.getOrDefault(normalizeElement(element), ELEMENT_TASKS.get("NEUTRAL")));
        }
        out.add(bondTask(residentId));
        return personalize(dedupeIds(out), name);
    }

    /** The personal rung — stable per card id so a Siegeling's bond task never shuffles. */
    public static TaskDefinition bondTask(String residentId) {
        String key = residentId == null ? "" : residentId;
        int index = Math.floorMod(key.hashCode(), BOND_TASKS.size());
        return BOND_TASKS.get(index);
    }

    public static Set<String> elementKeys() {
        return ELEMENT_TASKS.keySet();
    }

    /** The shipped element ladders, for the dashboard's "start from the defaults" button. */
    public static Map<String, List<TaskDefinition>> shippedElementTasks() {
        return ELEMENT_TASKS;
    }

    public static List<TaskDefinition> shippedBondTasks() {
        return BOND_TASKS;
    }

    public static String normalizeElement(String element) {
        String key = element == null || element.isBlank() ? "NEUTRAL" : element.trim().toUpperCase(Locale.ROOT);
        return ELEMENT_TASKS.containsKey(key) ? key : "NEUTRAL";
    }

    private static List<TaskDefinition> personalize(List<TaskDefinition> tasks, String name) {
        List<TaskDefinition> out = new ArrayList<>();
        for (TaskDefinition task : tasks) {
            out.add(new TaskDefinition(task.id(), task.event(), task.goal(),
                    task.name().replace("{name}", name), task.description().replace("{name}", name),
                    task.rapport(), task.gold(), task.remnants(), task.source()));
        }
        return List.copyOf(out);
    }

    /** Two rungs cannot share an id, or their progress buckets would collide in state. */
    private static List<TaskDefinition> dedupeIds(List<TaskDefinition> tasks) {
        Set<String> seen = new LinkedHashSet<>();
        List<TaskDefinition> out = new ArrayList<>();
        for (TaskDefinition task : tasks) {
            String id = task.id();
            int suffix = 2;
            while (!seen.add(id)) id = task.id() + "_" + suffix++;
            out.add(id.equals(task.id()) ? task : new TaskDefinition(id, task.event(), task.goal(),
                    task.name(), task.description(), task.rapport(), task.gold(), task.remnants(), task.source()));
        }
        return out;
    }

    private static List<TaskDefinition> fromTuning(List<KeepTuning.Task> tasks, String source) {
        List<TaskDefinition> out = new ArrayList<>();
        int rung = 0;
        for (KeepTuning.Task task : tasks) {
            String id = task.id() == null || task.id().isBlank() ? "custom_" + (rung + 1) : task.id().trim();
            String event = task.event() == null ? "" : task.event().trim().toUpperCase(Locale.ROOT);
            if (!EVENT_TYPES.contains(event)) event = "TIMBER_COLLECTION";
            int tier = Math.min(rung, RUNG_RAPPORT.length - 1);
            out.add(new TaskDefinition(id, event,
                    task.goal() == null || task.goal() < 1 ? 3 : task.goal(),
                    task.name() == null || task.name().isBlank() ? "A Task Together" : task.name().trim(),
                    task.description() == null || task.description().isBlank()
                            ? "{name} asks for a hand around the sanctuary." : task.description().trim(),
                    task.rapport() == null || task.rapport() < 0 ? RUNG_RAPPORT[tier] : task.rapport(),
                    task.gold() == null || task.gold() < 0 ? RUNG_GOLD[tier] : task.gold(),
                    task.remnants() == null || task.remnants() < 0 ? RUNG_REMNANTS[tier] : task.remnants(),
                    source));
            rung++;
        }
        return dedupeIds(out);
    }

    private static TaskDefinition element(int rung, String id, String event, int goal, String name, String description) {
        return new TaskDefinition(id, event, goal, name, description,
                RUNG_RAPPORT[rung], RUNG_GOLD[rung], RUNG_REMNANTS[rung], "ELEMENT");
    }

    private static Map<String, List<TaskDefinition>> createElementTasks() {
        Map<String, List<TaskDefinition>> out = new LinkedHashMap<>();
        out.put("FIRE", List.of(
                element(0, "fire_1", "CRAFTING", 2, "Work the Heat With Me",
                        "{name} will only trust a forge that lets it step away — craft 2 items while it watches."),
                element(1, "fire_2", "CONSTRUCTION", 1, "Something Worth the Burn",
                        "Finish a construction project so {name} can see the fire it lends put to lasting use.")));
        out.put("WATER", List.of(
                element(0, "water_1", "MATERIAL_COLLECTION", 3, "Draw Without Draining",
                        "Collect from the workshops 3 times so {name} can check nothing was taken past its limit."),
                element(1, "water_2", "TIMBER_COLLECTION", 3, "Follow the Old Channel",
                        "Gather timber 3 times while {name} traces where the water used to run.")));
        out.put("ICE", List.of(
                element(0, "ice_1", "MATERIAL_COLLECTION", 3, "Keep It Cold, Keep It Whole",
                        "Collect workshop materials 3 times so {name} can pack them away before they spoil."),
                element(1, "ice_2", "CRAFTING", 2, "Slow Enough To Last",
                        "Craft 2 items at {name}'s pace — it insists nothing set in haste survives a winter.")));
        out.put("WIND", List.of(
                element(0, "wind_1", "TIMBER_COLLECTION", 3, "Only What Has Fallen",
                        "Gather timber 3 times while {name} marks which limbs the grove already let go."),
                element(1, "wind_2", "CONVERSATION", 2, "News From the Road",
                        "Speak with 2 visitors so {name} can hear what is moving beyond the walls.")));
        out.put("EARTH", List.of(
                element(0, "earth_1", "TIMBER_COLLECTION", 3, "Roots Before Rafters",
                        "Gather timber 3 times while {name} settles the ground the grove grows from."),
                element(1, "earth_2", "CONSTRUCTION", 1, "Set It Deep",
                        "Complete a construction project so {name} can pack the footings itself.")));
        out.put("METAL", List.of(
                element(0, "metal_1", "CRAFTING", 2, "Made To Be Repaired",
                        "Craft 2 items with {name}, which refuses any design it cannot take apart again."),
                element(1, "metal_2", "CONSTRUCTION", 1, "True To the Line",
                        "Finish a construction project so {name} can measure it against its own reckoning.")));
        out.put("ELECTRIC", List.of(
                element(0, "electric_1", "MATERIAL_COLLECTION", 3, "Mind the Current",
                        "Collect from the workshops 3 times so {name} can balance what the keep is drawing."),
                element(1, "electric_2", "CRAFTING", 2, "A Charge Worth Holding",
                        "Craft 2 items while {name} tunes them to carry power without spilling it.")));
        out.put("POISON", List.of(
                element(0, "poison_1", "MATERIAL_COLLECTION", 3, "What the Soil Kept",
                        "Collect workshop materials 3 times while {name} sorts out what the ground should never return."),
                element(1, "poison_2", "TIMBER_COLLECTION", 3, "Cut Around the Blight",
                        "Gather timber 3 times so {name} can show you which growth is still sick beneath the bark.")));
        out.put("SHADOW", List.of(
                element(0, "shadow_1", "CONVERSATION", 2, "Say It in the Dark",
                        "Speak with 2 visitors — {name} listens better when no one is watching it listen."),
                element(1, "shadow_2", "MATERIAL_COLLECTION", 3, "Kept Out of Sight",
                        "Collect from the workshops 3 times so {name} can stow a reserve no raid would find.")));
        out.put("PSYCHIC", List.of(
                element(0, "psychic_1", "CONVERSATION", 2, "Sit With the Thought",
                        "Speak with 2 visitors so {name} can weigh what each of them left unsaid."),
                element(1, "psychic_2", "DECORATION", 1, "Somewhere To Rest a Mind",
                        "Place a decoration in any room — {name} needs one still corner it can return to.")));
        out.put("LIGHT", List.of(
                element(0, "light_1", "DECORATION", 1, "Give the Room Its Light",
                        "Place a decoration so {name} can watch a room stop looking like a ruin."),
                element(1, "light_2", "CONVERSATION", 2, "Answer the Door Yourself",
                        "Speak with 2 visitors — {name} believes a sanctuary is judged by who it greets.")));
        out.put("UNDEAD", List.of(
                element(0, "undead_1", "MATERIAL_COLLECTION", 3, "Nothing Wasted, Nothing Lost",
                        "Collect from the workshops 3 times while {name} accounts for every scrap the keep made."),
                element(1, "undead_2", "DECORATION", 1, "A Place for the Remembered",
                        "Place a decoration so {name} has somewhere to set what it carried out of the war.")));
        out.put("NEUTRAL", List.of(
                element(0, "neutral_1", "TIMBER_COLLECTION", 3, "Shelter in Living Wood",
                        "Gather timber 3 times while {name} makes a home of the Enclave."),
                element(1, "neutral_2", "CRAFTING", 2, "A Tool Made Together",
                        "Craft 2 items so {name} can leave its mark on something the keep uses daily.")));
        return Map.copyOf(out);
    }

    /** The personal rung. One of these is bound to each card id and never changes for it. */
    private static List<TaskDefinition> createBondTasks() {
        return List.of(
                bond("bond_walk", "CONVERSATION", 2, "A Walk To the Old Line",
                        "{name} wants you beside it while it speaks to 2 visitors about the front it came from."),
                bond("bond_reach", "MATERIAL_COLLECTION", 4, "Something Only {name} Can Reach",
                        "Collect from the workshops 4 times — {name} says there is a seam only it can work loose."),
                bond("bond_corner", "DECORATION", 2, "{name}'s Own Corner",
                        "Place 2 decorations. {name} has been describing the room it wants for weeks."),
                bond("bond_hands", "CRAFTING", 3, "Hands Learned By Watching",
                        "Craft 3 items. {name} has been copying your grip and would like to try it properly."),
                bond("bond_grove", "TIMBER_COLLECTION", 4, "The Grove {name} Remembers",
                        "Gather timber 4 times so {name} can find the stand of trees it was hiding in when you met."),
                bond("bond_lasting", "CONSTRUCTION", 1, "Raising Something That Lasts",
                        "Finish a construction project with {name} — it has never helped build anything before."));
    }

    private static TaskDefinition bond(String id, String event, int goal, String name, String description) {
        return new TaskDefinition(id, event, goal, name, description,
                RUNG_RAPPORT[2], RUNG_GOLD[2], RUNG_REMNANTS[2], "BOND");
    }
}
