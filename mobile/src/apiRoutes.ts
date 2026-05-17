/**
 * REST routes implemented by {@code com.sieglings.controller.*}.
 * Multiplayer: send {@code X-Room-Id} and {@code X-Player-Token} on game endpoints when using a room session.
 * Auth: send {@code Authorization: Bearer <token>} when logged in.
 */
export const ApiRoutes = {
  game: {
    options: "/api/game/options",
    new: "/api/game/new",
    mulligan: "/api/game/mulligan",
    state: "/api/game/state",
    draw: "/api/game/draw",
    place: "/api/game/place",
    cast: "/api/game/cast",
    claim: "/api/game/claim",
    trainer: "/api/game/trainer",
    battle: "/api/game/battle",
    battleAction: "/api/game/battle/action",
    endTurn: "/api/game/endturn",
    placements: "/api/game/placements",
  },
  match: {
    create: "/api/match/create",
    join: "/api/match/join",
    status: "/api/match/status",
  },
  auth: {
    register: "/api/auth/register",
    login: "/api/auth/login",
    resetPassword: "/api/auth/reset-password",
    logout: "/api/auth/logout",
    me: "/api/auth/me",
  },
  profile: {
    saveDeck: "/api/profile/decks",
    deleteDeck: "/api/profile/decks/delete",
  },
  leaderboards: "/api/leaderboards",
  cardsEditor: {
    get: "/api/cards/editor",
    post: "/api/cards/editor",
    authBootstrap: "/api/cards/editor/auth/bootstrap",
    authLogin: "/api/cards/editor/auth/login",
    authLogout: "/api/cards/editor/auth/logout",
  },
} as const;

export type ApiRoutesType = typeof ApiRoutes;
