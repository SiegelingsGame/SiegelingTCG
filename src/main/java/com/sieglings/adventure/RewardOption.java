package com.sieglings.adventure;

import com.sieglings.model.enums.Element;

/**
 * One selectable post-battle reward. Exactly one payload group is populated
 * depending on {@link #kind}:
 * <ul>
 *   <li>{@code CARD}    — {@link #cardSpec} + {@link #ownerId} (add a new card to the deck)</li>
 *   <li>{@code UPGRADE} — {@link #templateIndex} (strengthen an existing deck card)</li>
 *   <li>{@code RECRUIT} — {@link #sieglingId} (a new Siegeling joins the warband)</li>
 * </ul>
 */
record RewardOption(
        String id,
        String kind,
        String title,
        String desc,
        Element element,
        String artUrl,
        AbilitySpec cardSpec,
        String ownerId,
        int templateIndex,
        String sieglingId
) {
    static RewardOption card(String id, String title, String desc, Element element, AbilitySpec spec, String ownerId) {
        return new RewardOption(id, "CARD", title, desc, element, null, spec, ownerId, -1, null);
    }

    static RewardOption upgrade(String id, String title, String desc, Element element, int templateIndex) {
        return new RewardOption(id, "UPGRADE", title, desc, element, null, null, null, templateIndex, null);
    }

    static RewardOption recruit(String id, String title, String desc, Element element, String artUrl, String sieglingId) {
        return new RewardOption(id, "RECRUIT", title, desc, element, artUrl, null, null, -1, sieglingId);
    }
}
