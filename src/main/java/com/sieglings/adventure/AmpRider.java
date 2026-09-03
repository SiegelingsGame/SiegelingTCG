package com.sieglings.adventure;

/**
 * An extra effect bolted onto a move by a level-up amplification, resolved
 * after the move's own effect. Riders exist because some effects have no
 * magnitude worth raising — a notch swap either happens or it does not — so the
 * amp has to give the card something new to do instead of a bigger number.
 */
enum AmpRider {
    /** No rider: the amp raised the move's own value or dropped its cost. */
    NONE,
    /** Heals both units the move touched. */
    HEAL,
    /** Shields both units the move touched until their next turn. */
    SHIELD,
    /** Adds flat attack to both units the move touched, for {@code SiegeTuning.RIDER_BUFF_ROUNDS} rounds. */
    ATTACK
}
