/** Base URL for the Spring Boot API (empty = same origin; Vite dev proxies /api → 8080). */
export const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/** Default timeout so hung API calls surface a clear error instead of infinite loading. */
export const API_FETCH_TIMEOUT_MS = 45000;
/** Cold-start + large payload endpoints may legitimately take longer. */
export const API_HEAVY_FETCH_TIMEOUT_MS = 300000;

function networkHint() {
  return API_BASE
    ? `Cannot reach API at ${API_BASE}.`
    : "Start the SiegelingsTCG Spring Boot app on port 8080 (Vite proxies /api there in dev).";
}

async function fetchWithTimeout(url, init = {}, timeoutMs = API_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error(`Request timed out (${timeoutMs / 1000}s). ${networkHint()}`);
    }
    if (e instanceof TypeError) {
      throw new Error(`${networkHint()} (${e.message || "network error"})`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** Set when using /api/match/* — attaches X-Room-Id / X-Player-Token to game + match calls. */
export let multiplayerSession = null;
export function setMultiplayerSession(session) {
  multiplayerSession = session;
}

function mpHeaders() {
  const h = {};
  if (multiplayerSession?.roomId) h["X-Room-Id"] = multiplayerSession.roomId;
  if (multiplayerSession?.playerToken) h["X-Player-Token"] = multiplayerSession.playerToken;
  return h;
}

async function readJsonSafe(resp) {
  const text = await resp.text();
  if (!text || !text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Server returned ${resp.status} (not JSON). Is the API running on port 8080?`);
  }
}

/**
 * Solo game endpoints must not send multiplayer room headers — the server shares one
 * GameService instance; stray X-Room-Id can confuse clients and some proxies.
 */
export function clearMultiplayerSession() {
  multiplayerSession = null;
}

export async function apiGame(endpoint, method = "POST", body = null, options = {}) {
  const { omitMultiplayerHeaders = false } = options;
  const headers = { "Content-Type": "application/json" };
  if (!omitMultiplayerHeaders) Object.assign(headers, mpHeaders());
  const opts = { method, headers };
  if (body != null) opts.body = JSON.stringify(body);
  const r = await fetchWithTimeout(`${API_BASE}/api/game/${endpoint}`, opts);
  const data = await readJsonSafe(r);
  if (!r.ok) {
    const msg = data?.error || data?.message || `HTTP ${r.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  if (data.error) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
  return data;
}

/** Full catalog payload is heavy; cache + dedupe keeps loadout snappy on repeat visits. */
const GAME_OPTIONS_TTL_MS = 5 * 60 * 1000;
let gameOptionsCache = null;
let gameOptionsInflight = null;

export function peekCachedGameOptions() {
  if (gameOptionsCache && Date.now() - gameOptionsCache.fetchedAt < GAME_OPTIONS_TTL_MS) {
    return gameOptionsCache.data;
  }
  return null;
}

/** Fire-and-forget: call on app load so the first real screen isn’t waiting on a cold JVM + huge JSON. */
export function prefetchGameOptions() {
  getGameOptions().catch(() => {});
}

/**
 * @param {{ forceRefresh?: boolean }} [options]
 */
export async function getGameOptions(options = {}) {
  const { forceRefresh = false } = options;
  const now = Date.now();
  if (!forceRefresh && gameOptionsCache && now - gameOptionsCache.fetchedAt < GAME_OPTIONS_TTL_MS) {
    return gameOptionsCache.data;
  }
  if (gameOptionsInflight) {
    return gameOptionsInflight;
  }
  gameOptionsInflight = (async () => {
    try {
      // Prefer the lightweight endpoint; fall back to the full payload if unavailable.
      let r = await fetchWithTimeout(`${API_BASE}/api/game/options-lite`, {}, API_FETCH_TIMEOUT_MS);
      let data = await readJsonSafe(r);
      if (!r.ok) {
        r = await fetchWithTimeout(`${API_BASE}/api/game/options`, {}, API_HEAVY_FETCH_TIMEOUT_MS);
        data = await readJsonSafe(r);
      }
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      gameOptionsCache = { data, fetchedAt: Date.now() };
      return data;
    } finally {
      gameOptionsInflight = null;
    }
  })();
  return gameOptionsInflight;
}

export async function getGameState(options = {}) {
  const { omitMultiplayerHeaders = false } = options;
  const headers = {};
  if (!omitMultiplayerHeaders) Object.assign(headers, mpHeaders());
  const r = await fetchWithTimeout(`${API_BASE}/api/game/state`, { headers });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}

export async function getPlacements(options = {}) {
  const { omitMultiplayerHeaders = false } = options;
  const headers = {};
  if (!omitMultiplayerHeaders) Object.assign(headers, mpHeaders());
  const r = await fetchWithTimeout(`${API_BASE}/api/game/placements`, { headers });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}

export async function getLeaderboards() {
  const r = await fetchWithTimeout(`${API_BASE}/api/leaderboards`);
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}

export async function createMatch(body) {
  const r = await fetchWithTimeout(`${API_BASE}/api/match/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return readJsonSafe(r);
}

export async function joinMatch(body) {
  const r = await fetchWithTimeout(`${API_BASE}/api/match/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return readJsonSafe(r);
}

export async function getMatchStatus() {
  const r = await fetchWithTimeout(`${API_BASE}/api/match/status`, { headers: { ...mpHeaders() } });
  const data = await readJsonSafe(r);
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}
