package com.sieglings.adventure;

import com.sieglings.model.enums.Element;

/**
 * One interaction available at a Rest Camp stop — resting is always free;
 * a wandering trader or Siegeling broker may have set up by the fire and
 * offers goods for gold. Each option can be used once per camp.
 */
class CampOption {
    /** REST, SHOP_CARD, SHOP_HEAL, SHOP_UPGRADE, BROKER. */
    final String id;
    final String kind;
    final String title;
    final String desc;
    final int cost;
    final Element element;
    final String artUrl;

    final AbilitySpec cardSpec;   // SHOP_CARD: the move on offer
    final String ownerId;         // SHOP_CARD: Siegeling that learns it
    final int templateIndex;      // SHOP_UPGRADE: deck template to strengthen
    final String sieglingId;      // BROKER: recruit id

    boolean used;

    private CampOption(String id, String kind, String title, String desc, int cost, Element element,
                       String artUrl, AbilitySpec cardSpec, String ownerId, int templateIndex, String sieglingId) {
        this.id = id;
        this.kind = kind;
        this.title = title;
        this.desc = desc;
        this.cost = cost;
        this.element = element;
        this.artUrl = artUrl;
        this.cardSpec = cardSpec;
        this.ownerId = ownerId;
        this.templateIndex = templateIndex;
        this.sieglingId = sieglingId;
    }

    static CampOption rest(String id) {
        return new CampOption(id, "REST", "Rest by the fire", "The party recovers 40% HP.", 0,
                null, null, null, null, -1, null);
    }

    static CampOption shopCard(String id, AbilitySpec spec, String ownerId, String ownerName, int cost) {
        return new CampOption(id, "SHOP_CARD", spec.name(),
                (spec.description() == null || spec.description().isBlank() ? "A new move" : spec.description())
                        + " · learned by " + ownerName, cost, spec.element(), null, spec, ownerId, -1, null);
    }

    static CampOption shopHeal(String id, int cost) {
        return new CampOption(id, "SHOP_HEAL", "Hot stew", "Everyone eats well: the party recovers 25% HP.",
                cost, null, null, null, null, -1, null);
    }

    static CampOption shopUpgrade(String id, String cardName, Element element, int templateIndex, int cost) {
        return new CampOption(id, "SHOP_UPGRADE", "Sharpen " + cardName,
                "The trader hones this card: it grows stronger (or cheaper).", cost, element, null, null, null,
                templateIndex, null);
    }

    static CampOption broker(String id, String name, Element element, String artUrl, String sieglingId, int cost) {
        return new CampOption(id, "BROKER", name + " joins for hire",
                "The broker's " + name + " (" + element.name() + ") joins the warband with its moves.",
                cost, element, artUrl, null, null, -1, sieglingId);
    }

    /** Revive a fallen Siegeling at camp — ownerId carries the fallen member's id. */
    static CampOption revive(String id, String memberId, String memberName, int pct, int cost) {
        return new CampOption(id, pct >= 100 ? "REVIVE100" : "REVIVE50",
                "Revive " + memberName + " (" + pct + "%)",
                memberName + " returns to the warband at " + pct + "% HP.",
                cost, null, null, null, memberId, -1, null);
    }

    /** Rent a mercenary Siegeling for the NEXT battle only (broker stall). */
    static CampOption merc(String id, String name, Element element, String artUrl, String sieglingId, int cost) {
        return new CampOption(id, "MERC", name + " — mercenary",
                "A battle-hardened " + name + " (" + element.name() + ") fights your NEXT battle with boon cards, then departs.",
                cost, element, artUrl, null, null, -1, sieglingId);
    }

    /** A generic cache mini-game option (chest pick, wheel spin, …). */
    static CampOption cache(String id, String kind, String title, String desc, int cost) {
        return new CampOption(id, kind, title, desc, cost, null, null, null, null, -1, null);
    }
}
