package com.sieglings.adventure;

import com.sieglings.model.TrainerCard;
import com.sieglings.model.enums.Element;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Package bridge so Campaign mode can run a one-off Siege AP capture without
 * living inside {@link SiegeService}'s expedition lifecycle.
 */
@Service
public class CampaignWildSupport {

    @Autowired private SiegeContentService content;
    @Autowired private SiegeCombatEngine combat;

    private final Map<String, SiegeRun> byCampaignToken = new ConcurrentHashMap<>();

    public record StartResult(String captureCardId, String captureName) {}

    public StartResult start(String campaignToken, TrainerCard squire, List<String> partyCardIds,
                             SiegeLand land, Random rng) {
        SiegeRun siege = new SiegeRun("campaign-wild-" + campaignToken);
        siege.setKnightId(squire.getId());
        siege.setKnightName(squire.getName());
        siege.setKnightElement(squire.getElement());
        siege.setKnightPassive(KnightPassive.HEALTH);
        siege.setKnightPassiveValue(1);
        siege.setKnightPassiveDesc("Front Row allies gain +1 max Health");
        siege.setKnightUnit(content.toKnightCombatant(squire));
        siege.setKnightActive(content.knightActiveSpec(squire));

        int slot = 0;
        for (String id : partyCardIds) {
            if (slot >= 3) break;
            var opt = content.findAnySiegling(id);
            if (opt.isEmpty()) continue;
            Combatant member = content.toPartyCombatant(opt.get(), slot);
            siege.getParty().add(member);
            siege.getDeckTemplates().addAll(content.deckCardsFor(opt.get(), member.getId()));
            slot++;
        }
        if (siege.getParty().isEmpty()) {
            throw new IllegalStateException("No warband ready for a wild capture.");
        }
        if (siege.getKnightActive() != null) {
            siege.getDeckTemplates().add(new SiegeCard("knightcard", "knight-" + squire.getId(), siege.getKnightActive()));
        }
        siege.setLand(land);

        List<Element> palette = land.weightedPalette(List.of(land.elements().get(0)));
        List<Combatant> foes = content.generateEnemies(NodeType.BATTLE, 1,
                Math.max(1, siege.getParty().size()), 0, rng, palette);
        if (foes.isEmpty()) {
            throw new IllegalStateException("No wild Siegelings appeared.");
        }
        // Local catalogs often lack uploaded cardArtUrl, so shadeCard leaves foes
        // nameless-of-art. Assign a SiegeSprites-backed card id so the campaign UI
        // can crop idle strips (and captures can resolve to a real roster card).
        java.util.Set<String> avoid = new java.util.HashSet<>(partyCardIds);
        for (Combatant foe : foes) {
            paintFoeSilhouette(foe, avoid, rng);
            if (foe.getDisplayCardId() != null) avoid.add(foe.getDisplayCardId());
        }
        Combatant primary = foes.get(0);
        String captureId = primary.getDisplayCardId();
        combat.startBattle(siege, NodeType.BATTLE, foes, rng);
        byCampaignToken.put(campaignToken, siege);
        String captureName = primary.getShadeOf() != null
                ? ("Shade of " + primary.getShadeOf())
                : primary.getName();
        return new StartResult(captureId, captureName);
    }

    /** Element → shipped sprite sheets (see siege-sprites.js). */
    private static final Map<Element, String[]> SPRITE_BY_ELEMENT = Map.ofEntries(
            Map.entry(Element.FIRE, new String[] { "sundile", "raydile", "solgator" }),
            Map.entry(Element.EARTH, new String[] { "cacty", "jackedty", "cactyjackedty" }),
            Map.entry(Element.WIND, new String[] { "breezee", "gagglestand", "hurricrane" }),
            Map.entry(Element.ICE, new String[] { "fawny", "chilldoe", "frostag" }),
            Map.entry(Element.WATER, new String[] { "draco", "dracoil" }),
            Map.entry(Element.POISON, new String[] { "squirebud", "floraknight", "generoot" }),
            Map.entry(Element.LIGHT, new String[] { "squirebud", "floraknight" }),
            Map.entry(Element.SHADOW, new String[] { "draco", "dracoil" }),
            Map.entry(Element.METAL, new String[] { "cacty", "jackedty" }),
            Map.entry(Element.ELECTRIC, new String[] { "sundile", "raydile" }),
            Map.entry(Element.PSYCHIC, new String[] { "fawny", "chilldoe" }),
            Map.entry(Element.UNDEAD, new String[] { "draco", "squirebud" }));

    private void paintFoeSilhouette(Combatant foe, java.util.Set<String> avoid, Random rng) {
        if (foe.getDisplayCardId() != null) return;
        String[] pool = SPRITE_BY_ELEMENT.getOrDefault(foe.getElement(),
                new String[] { "squirebud", "sundile", "cacty", "breezee", "fawny" });
        List<String> picks = new ArrayList<>();
        for (String id : pool) {
            if (!avoid.contains(id)) picks.add(id);
        }
        if (picks.isEmpty()) {
            for (String id : pool) picks.add(id);
        }
        String id = picks.get(rng.nextInt(picks.size()));
        foe.setArtCardId(id);
        content.findAnySiegling(id).ifPresent(s -> foe.setShadeOf(s.getName()));
    }

    public void play(String campaignToken, String cardInstanceId, String targetId, Random rng) {
        SiegeRun siege = require(campaignToken);
        SiegeCombatEngine.PlayResult result = combat.playCard(siege, cardInstanceId, targetId, rng);
        if (!result.ok) throw new IllegalArgumentException(result.message);
        forcePartyWipeLoss(siege);
    }

    public void endTurn(String campaignToken, Random rng) {
        SiegeRun siege = require(campaignToken);
        combat.endPlayerTurn(siege, rng);
        forcePartyWipeLoss(siege);
    }

    public boolean isOver(String campaignToken) {
        SiegeRun siege = byCampaignToken.get(campaignToken);
        if (siege == null) return true;
        SiegeBattle battle = siege.getBattle();
        return battle != null && battle.isOver();
    }

    public boolean won(String campaignToken) {
        SiegeRun siege = byCampaignToken.get(campaignToken);
        if (siege == null) return false;
        SiegeBattle battle = siege.getBattle();
        return battle != null && battle.getPhase() == BattlePhase.WON;
    }

    /**
     * Siege normally keeps fighting while the Knight lives even if the warband is down.
     * Campaign captures are about the Siegelings — a wiped party ends the skirmish.
     */
    private void forcePartyWipeLoss(SiegeRun siege) {
        SiegeBattle battle = siege.getBattle();
        if (battle == null || battle.isOver()) return;
        boolean partyAlive = false;
        for (Combatant c : battle.getCombatants()) {
            if (c.getSide() == Side.PLAYER && !c.isKnight() && c.isAlive()) {
                partyAlive = true;
                break;
            }
        }
        if (partyAlive) return;
        if (battle.living(Side.ENEMY).isEmpty()) {
            battle.setPhase(BattlePhase.WON);
            battle.log("Victory! The wild Siegelings are defeated.");
        } else {
            battle.setPhase(BattlePhase.LOST);
            battle.log("Your warband has fallen — the wilds drive you back.");
        }
    }

    public void clear(String campaignToken) {
        byCampaignToken.remove(campaignToken);
    }

    public Map<String, Object> battleView(String campaignToken) {
        SiegeRun siege = byCampaignToken.get(campaignToken);
        SiegeBattle battle = siege == null ? null : siege.getBattle();
        Map<String, Object> b = new LinkedHashMap<>();
        if (battle == null) {
            b.put("over", true);
            return b;
        }
        b.put("phase", battle.getPhase().name());
        b.put("roundNumber", battle.getRoundNumber());
        b.put("actionPoints", battle.getActionPoints());
        b.put("maxActionPoints", SiegeBattle.ACTIONS_PER_TURN);
        b.put("log", new ArrayList<>(battle.getLog()));
        b.put("over", battle.isOver());
        b.put("won", battle.getPhase() == BattlePhase.WON);

        List<Map<String, Object>> allies = new ArrayList<>();
        List<Map<String, Object>> foes = new ArrayList<>();
        for (Combatant c : battle.getCombatants()) {
            if (c.isKnight()) continue;
            Map<String, Object> cm = new LinkedHashMap<>();
            cm.put("id", c.getId());
            cm.put("name", c.getName());
            cm.put("hp", c.getHp());
            cm.put("maxHp", c.getMaxHp());
            String art = c.getArtUrl();
            if ((art == null || art.isBlank()) && c.getDisplayCardId() != null) {
                art = "/img/sprites/" + c.getDisplayCardId() + "/" + c.getDisplayCardId() + "-idle.webp";
            }
            cm.put("artUrl", art);
            cm.put("element", c.getElement() == null ? null : c.getElement().name());
            cm.put("alive", c.isAlive());
            cm.put("position", c.getPosition());
            cm.put("cardId", c.getDisplayCardId());
            // A unit with no animated sheet stands as its card's overlay cutout, so
            // the client needs the card art and its mode (only OVERLAY is a cutout).
            if (c.getDisplayCardId() != null) {
                content.findAnySiegling(c.getDisplayCardId()).ifPresent(card -> {
                    if (card.getCardArtUrl() != null && !card.getCardArtUrl().isBlank()) {
                        cm.put("cardArtUrl", card.getCardArtUrl());
                        cm.put("cardArtMode", card.getCardArtMode());
                    }
                });
            }
            cm.put("shadeOf", c.getShadeOf());
            if (c.getSide() == Side.PLAYER) allies.add(cm); else foes.add(cm);
        }
        b.put("allies", allies);
        b.put("enemies", foes);

        List<Map<String, Object>> hand = new ArrayList<>();
        for (SiegeCard card : battle.getHand()) {
            Map<String, Object> h = new LinkedHashMap<>();
            h.put("instanceId", card.getInstanceId());
            h.put("ownerId", card.getOwnerId());
            AbilitySpec spec = card.getSpec();
            if (spec != null) {
                h.put("name", spec.name());
                h.put("cost", spec.actionCost());
                h.put("effect", spec.effect() == null ? null : spec.effect().name());
                h.put("value", spec.value());
                h.put("target", spec.target() == null ? null : spec.target().name());
            }
            hand.add(h);
        }
        b.put("hand", hand);
        return b;
    }

    private SiegeRun require(String campaignToken) {
        SiegeRun siege = byCampaignToken.get(campaignToken);
        if (siege == null || siege.getBattle() == null) {
            throw new IllegalStateException("No wild battle in progress.");
        }
        return siege;
    }
}
