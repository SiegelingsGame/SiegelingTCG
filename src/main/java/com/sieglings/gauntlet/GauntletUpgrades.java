package com.sieglings.gauntlet;

import com.sieglings.gauntlet.GauntletRun.Upgrade;
import com.sieglings.model.Ability;
import com.sieglings.model.AbilityEffectKeys;
import com.sieglings.model.Card;
import com.sieglings.model.Notch;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.TargetType;
import com.sieglings.service.MovesPoolService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Random;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The forge: which upgrades a card can take, and how a list of upgrades turns a fresh
 * catalog copy into the run's version of that card. Upgrades are replayed onto a new
 * copy at every battle start, so the run only ever stores the list.
 */
@Component
public class GauntletUpgrades {

    public static final String HEALTH = "HEALTH";
    public static final String SPEED = "SPEED";
    public static final String MOVE_POWER = "MOVE_POWER";
    public static final String MOVE_COST = "MOVE_COST";
    public static final String MOVE_RIDER = "MOVE_RIDER";
    public static final String ELEMENT = "ELEMENT";
    public static final String SPELL_POWER = "SPELL_POWER";
    public static final String SPELL_COST = "SPELL_COST";
    public static final String SPELL_RIDER = "SPELL_RIDER";

    static final int HEALTH_STEP = 3;
    static final int SPEED_STEP = 1;
    static final int MAX_RIDERS_PER_MOVE = 2;

    /** Elements with an energy pool, so an infused card can still pay for its moves. */
    static final List<Element> INFUSIBLE = List.of(
            Element.FIRE, Element.WATER, Element.EARTH, Element.WIND, Element.ICE,
            Element.ELECTRIC, Element.METAL, Element.SHADOW, Element.PSYCHIC, Element.UNDEAD,
            Element.POISON, Element.LIGHT);

    /** Value-carrying effects that "+N" makes stronger. Destroy/freeze have no number to raise. */
    private static final Set<String> SCALABLE = Set.of(
            AbilityEffectKeys.DAMAGE, AbilityEffectKeys.CHAIN_DAMAGE, AbilityEffectKeys.PLAYER_DAMAGE,
            AbilityEffectKeys.DRAIN, AbilityEffectKeys.HEAL, AbilityEffectKeys.OVERHEAL, AbilityEffectKeys.SHIELD, AbilityEffectKeys.DAMAGE_BOOST,
            AbilityEffectKeys.HEALTH_BOOST, AbilityEffectKeys.SPEED_BOOST, AbilityEffectKeys.SLOW,
            AbilityEffectKeys.CONNECTED_ALLIES_DAMAGE_BOOST, AbilityEffectKeys.CONNECTED_ALLIES_HEALTH_BOOST,
            AbilityEffectKeys.CONNECTED_ALLIES_HEAL, AbilityEffectKeys.CONNECTED_ALLIES_SHIELD,
            AbilityEffectKeys.CONNECTED_ALLIES_SPEED_BOOST, AbilityEffectKeys.ENERGY_BOOST);

    /** Extra effects a move can pick up. Each resolves through an ordinary effect key. */
    public enum Rider {
        LIFESTEAL("Lifesteal", "heals itself 2", TargetType.SELF, AbilityEffectKeys.HEAL, 2, false),
        GUARD("Guard", "shields itself 2", TargetType.SELF, AbilityEffectKeys.SHIELD, 2, false),
        FROSTBITE("Frostbite", "slows its target by 1", TargetType.SINGLE_ENEMY, AbilityEffectKeys.SLOW, 1, true),
        SIEGE("Siege Shot", "deals 2 damage to the enemy player", TargetType.ENEMY_PLAYER, AbilityEffectKeys.PLAYER_DAMAGE, 2, true),
        RALLY("Rally", "gives same-element allies +1 damage", TargetType.ALL_ALLIES, AbilityEffectKeys.DAMAGE_BOOST, 1, false),
        INSIGHT("Insight", "draws a card", TargetType.SELF, AbilityEffectKeys.DRAW, 1, true),
        SPLASH("Splash", "deals 1 damage to every enemy", TargetType.ALL_ENEMIES, AbilityEffectKeys.DAMAGE, 1, true);

        final String title;
        final String text;
        final TargetType target;
        final String effect;
        final int value;
        /** Riders that need no source creature, so a spell or trap can carry them. */
        final boolean sourceless;

        Rider(String title, String text, TargetType target, String effect, int value, boolean sourceless) {
            this.title = title;
            this.text = text;
            this.target = target;
            this.effect = effect;
            this.value = value;
            this.sourceless = sourceless;
        }

        static Rider parse(String key) {
            if (key == null) return null;
            try {
                return Rider.valueOf(key.trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException ex) {
                return null;
            }
        }

        Ability toAbility(String carrierName) {
            Ability rider = new Ability(carrierName, text, target, null, target == TargetType.SINGLE_ENEMY ? 1 : 0,
                    effect, value, false);
            rider.setRequiredEnergy(0);
            return rider;
        }
    }

    @Autowired
    private MovesPoolService movesPoolService;

    GauntletUpgrades() {}

    GauntletUpgrades(MovesPoolService movesPoolService) {
        this.movesPoolService = movesPoolService;
    }

    /** Replays every upgrade onto {@code card}, which must be a fresh catalog copy. */
    public Card materialize(Card card, List<Upgrade> upgrades) {
        if (card == null || upgrades == null || upgrades.isEmpty()) {
            return card;
        }
        if (card.getAbility() != null) {
            // Spell/trap copies share the catalog's Ability instance; never mutate that.
            card.setAbility(card.getAbility().copy());
        }
        for (Upgrade upgrade : upgrades) {
            apply(card, upgrade);
        }
        return card;
    }

    void apply(Card card, Upgrade upgrade) {
        if (upgrade == null || upgrade.type() == null) return;
        if (card instanceof SieglingCard siegling) {
            applyToSiegling(siegling, upgrade);
        } else {
            applyToCastable(card, upgrade);
        }
    }

    private void applyToSiegling(SieglingCard card, Upgrade upgrade) {
        switch (upgrade.type()) {
            case HEALTH -> card.setHealth(card.getHealth() + upgrade.value());
            case SPEED -> card.setSpeed(card.getSpeed() + upgrade.value());
            case MOVE_POWER -> {
                Ability move = editableMove(card, upgrade.moveIndex());
                if (move != null) raiseValue(move, upgrade.value());
            }
            case MOVE_COST -> {
                Ability move = editableMove(card, upgrade.moveIndex());
                if (move != null) move.setRequiredEnergy(Math.max(0, move.getRequiredEnergy() - upgrade.value()));
            }
            case MOVE_RIDER -> {
                Ability move = editableMove(card, upgrade.moveIndex());
                Rider rider = Rider.parse(upgrade.rider());
                if (move != null && rider != null) addRider(move, rider);
            }
            case ELEMENT -> infuse(card, parseElement(upgrade.element()));
            default -> { }
        }
    }

    private void applyToCastable(Card card, Upgrade upgrade) {
        Ability ability = card.getAbility();
        switch (upgrade.type()) {
            case SPELL_POWER -> {
                if (ability != null) raiseValue(ability, upgrade.value());
            }
            case SPELL_COST -> card.setCostAmount(Math.max(0, card.getCostAmount() - upgrade.value()));
            case SPELL_RIDER -> {
                Rider rider = Rider.parse(upgrade.rider());
                if (ability != null && rider != null) addRider(ability, rider);
            }
            default -> { }
        }
    }

    /**
     * The card's moves as its own editable list. The first edit snapshots the pool's
     * moves onto the card; from then on the card no longer follows the shared pool.
     */
    private Ability editableMove(SieglingCard card, int index) {
        if (!card.hasCustomMoves()) {
            card.setCustomMoves(new ArrayList<>(movesPoolService.resolvePrintedAbilities(card)));
        }
        List<Ability> moves = card.getCustomMoves();
        return index >= 0 && index < moves.size() ? moves.get(index) : null;
    }

    private void infuse(SieglingCard card, Element next) {
        Element previous = card.getElement();
        if (next == null || next == previous) return;
        if (!card.hasCustomMoves()) {
            card.setCustomMoves(new ArrayList<>(movesPoolService.resolvePrintedAbilities(card)));
        }
        card.setElement(next);
        if (card.getCostElement() == previous) {
            card.setCostElement(next);
        }
        // Its own-element notches follow it, or the card could no longer link into energy
        // it pays for. Off-element notches stay: they are how it bridges into combos.
        List<Notch> recoloured = new ArrayList<>();
        for (Notch notch : card.getNotches()) {
            recoloured.add(notch.element() == previous ? new Notch(notch.direction(), next) : notch);
        }
        card.setNotches(recoloured);
        for (Ability move : card.getCustomMoves()) {
            if (move.getRequiredElement() == previous) {
                move.setRequiredElement(next);
            }
        }
    }

    private static void addRider(Ability move, Rider rider) {
        List<Ability> riders = move.hasRiders() ? new ArrayList<>(move.getRiders()) : new ArrayList<>();
        riders.add(rider.toAbility(move.getName()));
        move.setRiders(riders);
        move.setDescription(appendSentence(move.getDescription(), "Also " + rider.text + "."));
    }

    /** Raises the effect value and keeps the printed text truthful about it. */
    private static void raiseValue(Ability ability, int amount) {
        int before = ability.getEffectValue();
        int after = before + amount;
        ability.setEffectValue(after);
        String description = ability.getDescription() == null ? "" : ability.getDescription();
        Matcher matcher = Pattern.compile("\\b" + before + "\\b").matcher(description);
        if (before > 0 && matcher.find()) {
            ability.setDescription(description.substring(0, matcher.start()) + after + description.substring(matcher.end()));
        } else {
            ability.setDescription(appendSentence(description, "Forged +" + amount + "."));
        }
    }

    private static String appendSentence(String base, String sentence) {
        String trimmed = base == null ? "" : base.trim();
        if (trimmed.isEmpty()) return sentence;
        return trimmed + (trimmed.endsWith(".") ? " " : ". ") + sentence;
    }

    static Element parseElement(String raw) {
        if (raw == null) return null;
        try {
            return Element.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    /**
     * Up to three distinct upgrades for a card in its current (materialized) state.
     * Varied on purpose: one stat, one move change and one wildcard beats three "+1"s.
     */
    public List<Upgrade> offer(Card card, Random rng) {
        List<Upgrade> pool = card instanceof SieglingCard siegling ? sieglingCandidates(siegling, rng) : castableCandidates(card, rng);
        Collections.shuffle(pool, rng);
        List<Upgrade> picked = new ArrayList<>();
        Set<String> typesTaken = new LinkedHashSet<>();
        for (Upgrade candidate : pool) {
            if (picked.size() >= 3) break;
            if (typesTaken.add(candidate.type())) picked.add(candidate);
        }
        for (Upgrade candidate : pool) {
            if (picked.size() >= 3) break;
            if (!picked.contains(candidate)) picked.add(candidate);
        }
        return picked;
    }

    private List<Upgrade> sieglingCandidates(SieglingCard card, Random rng) {
        List<Upgrade> out = new ArrayList<>();
        out.add(new Upgrade(HEALTH, -1, HEALTH_STEP, null, null, "+" + HEALTH_STEP + " Health"));
        out.add(new Upgrade(SPEED, -1, SPEED_STEP, null, null, "+" + SPEED_STEP + " Speed"));
        List<Ability> moves = movesPoolService.resolvePrintedAbilities(card);
        for (int i = 0; i < moves.size(); i++) {
            Ability move = moves.get(i);
            if (move == null || move.isPassive()) continue;
            String name = move.getName();
            if (SCALABLE.contains(move.getEffectType())) {
                int step = isMultiTarget(move) ? 1 : 2;
                out.add(new Upgrade(MOVE_POWER, i, step, null, null, name + ": +" + step + " " + valueNoun(move)));
            }
            if (move.getRequiredEnergy() > 0) {
                out.add(new Upgrade(MOVE_COST, i, 1, null, null, name + ": costs 1 less energy"));
            }
            int riders = move.hasRiders() ? move.getRiders().size() : 0;
            if (riders < MAX_RIDERS_PER_MOVE) {
                Rider rider = pickRider(move, false, rng);
                if (rider != null) {
                    out.add(new Upgrade(MOVE_RIDER, i, 0, null, rider.name(), name + ": also " + rider.text));
                }
            }
        }
        List<Element> elements = new ArrayList<>(INFUSIBLE);
        elements.remove(card.getElement());
        if (!elements.isEmpty()) {
            Element next = elements.get(rng.nextInt(elements.size()));
            out.add(new Upgrade(ELEMENT, -1, 0, next.name(), null, "Infuse with " + titleCase(next.name())
                    + ": becomes " + titleCase(next.name()) + " (moves, notches and damage)"));
        }
        return out;
    }

    private List<Upgrade> castableCandidates(Card card, Random rng) {
        List<Upgrade> out = new ArrayList<>();
        Ability ability = card.getAbility();
        if (ability != null && SCALABLE.contains(ability.getEffectType())) {
            int step = isMultiTarget(ability) ? 1 : 2;
            out.add(new Upgrade(SPELL_POWER, -1, step, null, null, "+" + step + " " + valueNoun(ability)));
        }
        if (card.getCostAmount() > 0) {
            out.add(new Upgrade(SPELL_COST, -1, 1, null, null, "Costs 1 less energy"));
        }
        if (ability != null && (!ability.hasRiders() || ability.getRiders().size() < MAX_RIDERS_PER_MOVE)) {
            Rider rider = pickRider(ability, true, rng);
            if (rider != null) {
                out.add(new Upgrade(SPELL_RIDER, -1, 0, null, rider.name(), "Also " + rider.text));
            }
            Rider second = pickRider(ability, true, rng);
            if (second != null && second != rider) {
                out.add(new Upgrade(SPELL_RIDER, -1, 0, null, second.name(), "Also " + second.text));
            }
        }
        return out;
    }

    private static Rider pickRider(Ability move, boolean sourcelessOnly, Random rng) {
        Set<String> already = new LinkedHashSet<>();
        if (move.hasRiders()) {
            for (Ability rider : move.getRiders()) {
                already.add(rider.getEffectType() + ":" + rider.getTargetType());
            }
        }
        List<Rider> options = new ArrayList<>();
        for (Rider rider : Rider.values()) {
            if (sourcelessOnly && !rider.sourceless) continue;
            if (already.contains(rider.effect + ":" + rider.target)) continue;
            // A heal move does not need to heal itself on top; an AoE needs no splash.
            if (rider.effect.equals(move.getEffectType()) && rider.target == move.getTargetType()) continue;
            options.add(rider);
        }
        return options.isEmpty() ? null : options.get(rng.nextInt(options.size()));
    }

    private static boolean isMultiTarget(Ability ability) {
        TargetType target = ability.getTargetType();
        return target == TargetType.ALL_ENEMIES || target == TargetType.ALL_ALLIES
                || target == TargetType.ROW_ENEMIES || target == TargetType.ROW_ALLIES
                || target == TargetType.ROW_SELECT_ENEMIES || target == TargetType.ROW_SELECT_ALLIES
                || AbilityEffectKeys.CHAIN_DAMAGE.equals(ability.getEffectType());
    }

    private static String valueNoun(Ability ability) {
        String effect = ability.getEffectType() == null ? "" : ability.getEffectType();
        if (effect.contains("damage_boost")) return "damage boost";
        if (effect.contains("damage") || effect.equals(AbilityEffectKeys.DRAIN)) return "damage";
        if (effect.contains("heal")) return "healing";
        if (effect.contains("shield")) return "shield";
        if (effect.contains("health")) return "health boost";
        if (effect.contains("speed")) return "speed";
        if (effect.contains("slow")) return "slow";
        if (effect.contains("energy")) return "energy";
        return "power";
    }

    static String titleCase(String raw) {
        if (raw == null || raw.isEmpty()) return "";
        String lower = raw.toLowerCase(Locale.ROOT);
        return Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
    }
}
