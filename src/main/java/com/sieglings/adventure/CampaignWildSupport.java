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
        Combatant primary = foes.get(0);
        String captureId = primary.getDisplayCardId();
        combat.startBattle(siege, NodeType.BATTLE, foes, rng);
        byCampaignToken.put(campaignToken, siege);
        return new StartResult(captureId, primary.getName());
    }

    public void play(String campaignToken, String cardInstanceId, String targetId, Random rng) {
        SiegeRun siege = require(campaignToken);
        SiegeCombatEngine.PlayResult result = combat.playCard(siege, cardInstanceId, targetId, rng);
        if (!result.ok) throw new IllegalArgumentException(result.message);
    }

    public void endTurn(String campaignToken, Random rng) {
        combat.endPlayerTurn(require(campaignToken), rng);
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
            cm.put("artUrl", c.getArtUrl());
            cm.put("element", c.getElement() == null ? null : c.getElement().name());
            cm.put("alive", c.isAlive());
            cm.put("position", c.getPosition());
            cm.put("cardId", c.getDisplayCardId());
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
