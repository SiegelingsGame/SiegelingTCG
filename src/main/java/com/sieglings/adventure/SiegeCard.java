package com.sieglings.adventure;

/**
 * A card instance in a Siege deck/hand. Each card is one move of one of the
 * player's three Siegelings, so the card is only playable while its owning
 * Siegeling is alive (the owner is the attacker for damage/buff math).
 */
class SiegeCard {
    private final String instanceId;   // unique per physical card
    private final String ownerId;      // combatant id of the Siegeling that owns this move
    private final AbilitySpec spec;

    SiegeCard(String instanceId, String ownerId, AbilitySpec spec) {
        this.instanceId = instanceId;
        this.ownerId = ownerId;
        this.spec = spec;
    }

    String getInstanceId() { return instanceId; }
    String getOwnerId() { return ownerId; }
    AbilitySpec getSpec() { return spec; }
}
