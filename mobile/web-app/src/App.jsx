import { useState, useEffect, useRef, useCallback } from "react";
import {
  API_BASE,
  apiGame,
  getGameOptions,
  getGameState,
  getPlacements,
  getLeaderboards,
  joinMatch,
  getMatchStatus,
  setMultiplayerSession,
  multiplayerSession,
  clearMultiplayerSession,
  prefetchGameOptions,
  peekCachedGameOptions,
} from "./api.js";
import { elStyle } from "./elements.js";

/* Sieglings TCG — mobile web shell wired to Spring Boot (/api/game/*, H2 + Firestore-backed catalogs). */

/** Matches game.js ALL_DIRECTIONS / renderHandNotches. */
const ALL_NOTCH_DIRECTIONS = ["TOP", "TOP_RIGHT", "RIGHT", "BOTTOM_RIGHT", "BOTTOM", "BOTTOM_LEFT", "LEFT", "TOP_LEFT"];

function HandNotches({ notches, small }) {
  const map = {};
  for (const n of notches || []) {
    if (n?.direction) map[n.direction] = n;
  }
  const edge = small ? "4px" : "6px";
  const corner = small ? "5px" : "7px";
  return (
    <div
      className="hand-notches"
      style={{
        ["--notch-edge-offset"]: edge,
        ["--notch-corner-offset"]: corner,
      }}
    >
      <div className="notch-center" />
      {ALL_NOTCH_DIRECTIONS.map((dir) => {
        const n = map[dir];
        const elemClass = n?.element ? String(n.element).toLowerCase() : "";
        return <div key={dir} className={["notch-dot", elemClass, `notch-${dir}`].filter(Boolean).join(" ")} />;
      })}
    </div>
  );
}

function BoardNotches({ notches }) {
  const map = {};
  for (const n of notches || []) {
    if (n?.direction) map[n.direction] = n;
  }
  return (
    <div className="bc-notches">
      <div className="bc-notches-scale" aria-hidden>
        {ALL_NOTCH_DIRECTIONS.map((dir) => {
          const n = map[dir];
          const elemClass = n?.element ? String(n.element).toLowerCase() : "";
          if (n) {
            return <div key={dir} className={["bc-notch", `bc-notch-${dir}`, "filled", elemClass].filter(Boolean).join(" ")} />;
          }
          return <div key={dir} className={`bc-notch bc-notch-${dir} empty`} />;
        })}
      </div>
    </div>
  );
}

const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;500;600;700;800;900&family=Exo+2:wght@300;400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg-deep: #060A12; --bg-surface: #0C1220; --bg-card: #111827;
      --border-dim: rgba(100, 140, 200, 0.12); --border-glow: rgba(100, 180, 255, 0.25);
      --text-primary: #E8EDF5; --text-secondary: #8899B4; --text-dim: #5A6B85;
      --accent-blue: #3B82F6; --accent-cyan: #06B6D4; --accent-gold: #F59E0B;
      --danger: #EF4444; --success: #22C55E;
      --safe-top: env(safe-area-inset-top, 0px);
      --safe-right: env(safe-area-inset-right, 0px);
      --safe-bottom: env(safe-area-inset-bottom, 0px);
      --safe-left: env(safe-area-inset-left, 0px);
    }
    html, #root { width: 100%; height: 100%; overflow: hidden; background: var(--bg-deep); }
    body { background: var(--bg-deep); color: var(--text-primary); font-family: 'Exo 2', sans-serif;
      width: 100vw; height: 100dvh; min-height: 100dvh; overflow: hidden; -webkit-font-smoothing: antialiased; user-select: none; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes slideIn { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
    @keyframes cardDraw { from { opacity: 0; transform: translateY(40px) scale(0.9); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes breathe { 0%, 100% { box-shadow: 0 0 15px rgba(59,130,246,0.2); } 50% { box-shadow: 0 0 25px rgba(59,130,246,0.4); } }
    @keyframes crystalRotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner {
      width: 42px; height: 42px; border-radius: 50%;
      border: 3px solid rgba(100, 140, 200, 0.2);
      border-top-color: var(--accent-cyan);
      animation: spin 0.75s linear infinite;
    }
    .screen {
      width: 100vw; height: 100dvh; position: fixed; inset: 0;
      display: flex; flex-direction: column; overflow: hidden;
      padding: var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left);
    }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 12px 24px; border-radius: 10px; border: 1px solid var(--border-glow);
      background: linear-gradient(135deg, rgba(59,130,246,0.15), rgba(6,182,212,0.1));
      color: var(--text-primary); font-family: 'Rajdhani', sans-serif; font-weight: 600; font-size: 15px;
      letter-spacing: 0.5px; cursor: pointer; transition: all 0.2s; text-transform: uppercase;
      backdrop-filter: blur(8px); -webkit-tap-highlight-color: transparent;
    }
    .btn:active { transform: scale(0.96); }
    .btn.primary { background: linear-gradient(135deg, #3B82F6, #2563EB); border-color: rgba(59,130,246,0.5); box-shadow: 0 4px 20px rgba(59,130,246,0.3); }
    .btn.danger { background: linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.1)); border-color: rgba(239,68,68,0.3); color: #FCA5A5; }
    .btn.gold { background: linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.1)); border-color: rgba(245,158,11,0.3); color: #FCD34D; }
    .btn.sm { padding: 8px 14px; font-size: 12px; border-radius: 8px; }
    .btn:disabled { opacity: 0.4; pointer-events: none; }
    .glass { background: rgba(12, 18, 32, 0.7); backdrop-filter: blur(16px); border: 1px solid var(--border-dim); border-radius: 14px; }
    input, select { background: var(--bg-card); border: 1px solid var(--border-dim); border-radius: 10px; padding: 10px 14px;
      color: var(--text-primary); font-family: 'Exo 2', sans-serif; font-size: 14px; outline: none; width: 100%; }
    input:focus { border-color: var(--accent-blue); }
    ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: rgba(100,140,200,0.2); border-radius: 2px; }
  `}</style>
);

const ParticleBG = ({ intensity = 1 }) => {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    const resize = () => {
      c.width = window.innerWidth;
      c.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    const N = Math.floor(40 * intensity);
    const particles = Array.from({ length: N }, () => ({
      x: Math.random() * c.width,
      y: Math.random() * c.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 2 + 0.5,
      a: Math.random() * 0.4 + 0.1,
      hue: Math.random() * 60 + 200,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = c.width;
        if (p.x > c.width) p.x = 0;
        if (p.y < 0) p.y = c.height;
        if (p.y > c.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 70%, 65%, ${p.a})`;
        ctx.fill();
      });
      animRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [intensity]);
  return <canvas ref={canvasRef} style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: 0, pointerEvents: "none" }} />;
};

/** Renders server card JSON (hand or board) from GameController#serializeCard / serializeBoard. */
function ServerCard({ card, selected, onTap, small }) {
  if (!card) return null;
  const el = elStyle(card.element);
  const type = (card.type || "").toUpperCase();
  const isSiegling = type === "SIEGLING";
  const cost = card.costAmount != null ? card.costAmount : "—";
  const notches = card.notches || [];
  const showHandNotches = isSiegling;

  return (
    <div
      className={small ? "server-card--small" : ""}
      onClick={() => onTap && onTap(card)}
      style={{
        width: small ? 72 : 110,
        minWidth: small ? 72 : 110,
        height: small ? 100 : 154,
        borderRadius: 10,
        overflow: "visible",
        cursor: onTap ? "pointer" : "default",
        border: `1.5px solid ${selected ? el.color : "rgba(100,140,200,0.15)"}`,
        background: `linear-gradient(160deg, ${el.color}22, ${el.color}08, var(--bg-card))`,
        boxShadow: selected ? `0 0 16px ${el.color}40` : "0 2px 8px rgba(0,0,0,0.3)",
        transition: "all 0.2s",
        position: "relative",
        transform: selected ? "translateY(-4px)" : "none",
        flexShrink: 0,
        animation: "cardDraw 0.3s ease-out",
        isolation: "isolate",
      }}
    >
      {showHandNotches && <HandNotches notches={notches} small={small} />}
      <div
        style={{
          position: "absolute",
          top: 4,
          left: 4,
          width: small ? 18 : 22,
          height: small ? 18 : 22,
          borderRadius: "50%",
          background: el.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: small ? 10 : 12,
          fontWeight: 700,
          fontFamily: "'Orbitron', sans-serif",
          color: "#0a0a12",
          zIndex: 4,
        }}
      >
        {cost}
      </div>
      <div style={{ position: "absolute", top: 4, right: 5, fontSize: small ? 12 : 16, zIndex: 4 }}>{el.icon}</div>
      <div
        style={{
          position: "absolute",
          bottom: isSiegling ? 28 : 8,
          left: 0,
          right: 0,
          textAlign: "center",
          padding: "0 4px",
          fontFamily: "'Rajdhani', sans-serif",
          fontWeight: 600,
          fontSize: small ? 9 : 11,
          lineHeight: 1.2,
          color: "var(--text-primary)",
          zIndex: 2,
        }}
      >
        {card.name}
      </div>
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          fontSize: small ? 7 : 8,
          fontFamily: "'Orbitron', sans-serif",
          color: el.color,
          opacity: 0.55,
          marginTop: small ? 12 : 14,
          textTransform: "uppercase",
          zIndex: 2,
          pointerEvents: "none",
        }}
      >
        {type}
      </div>
      {isSiegling && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "space-around",
            padding: "4px 6px",
            background: "rgba(0,0,0,0.5)",
            fontFamily: "'Orbitron', sans-serif",
            fontSize: small ? 8 : 9,
            fontWeight: 600,
            zIndex: 4,
            borderRadius: "0 0 8px 8px",
          }}
        >
          <span style={{ color: "#EF4444" }}>♥{card.health ?? "?"}</span>
          <span style={{ color: "#22C55E" }}>⚡{card.speed ?? "?"}</span>
        </div>
      )}
    </div>
  );
}

function SplashScreen({ onEnter }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setTimeout(() => setShow(true), 200);
  }, []);
  return (
    <div className="screen" style={{ background: "radial-gradient(ellipse at 50% 30%, #0F1B3D, #060A12)", alignItems: "center", justifyContent: "center" }}>
      <ParticleBG intensity={1.5} />
      <div style={{ position: "relative", zIndex: 1, opacity: show ? 1 : 0, transition: "opacity 0.8s" }}>
        <div
          style={{
            width: 120,
            height: 120,
            margin: "0 auto 24px",
            background: "conic-gradient(from 0deg, #3B82F6, #06B6D4, #8B5CF6, #3B82F6)",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "breathe 3s infinite, crystalRotate 20s linear infinite",
          }}
        >
          <div style={{ width: 108, height: 108, borderRadius: "50%", background: "var(--bg-deep)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>⬡</div>
        </div>
        <h1 style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 900, fontSize: 32, textAlign: "center", letterSpacing: 3 }}>SIEGLINGS</h1>
        <p style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 14, letterSpacing: 6, textAlign: "center", color: "var(--text-dim)", marginTop: 4, textTransform: "uppercase" }}>Trading Card Game</p>
      </div>
      <div style={{ position: "relative", zIndex: 1, marginTop: 48, display: "flex", flexDirection: "column", gap: 12, width: 240 }}>
        <button className="btn primary" onClick={() => onEnter()} style={{ width: "100%", padding: "14px 24px", fontSize: 16 }}>
          Play
        </button>
      </div>
      <p style={{ position: "absolute", bottom: 24, left: 0, right: 0, textAlign: "center", fontSize: 11, color: "var(--text-dim)", zIndex: 1, lineHeight: 1.5, padding: "0 16px" }}>
        API: {API_BASE || "same origin — Vite proxies /api → http://127.0.0.1:8080"}
        <br />
        <span style={{ opacity: 0.85 }}>Start the Spring Boot app first, then open this page.</span>
      </p>
    </div>
  );
}

function LobbyScreen({ onStartLoadout, playerName, setPlayerName, lobbyMode, setLobbyMode }) {
  const [lb, setLb] = useState(null);
  const [roomCode, setRoomCode] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    getLeaderboards()
      .then(setLb)
      .catch(() => setLb(null));
  }, []);

  const winsBoard = lb?.boards?.wins?.slice(0, 5) || [];

  async function handleJoin() {
    setErr("");
    if (!roomCode.trim() || !playerName?.trim()) {
      setErr("Room code and name required.");
      return;
    }
    try {
      const o = await getGameOptions();
      const deckId = o.defaultDeckId || o.decks?.[0]?.id;
      const trainerId = o.defaultTrainerId || o.decks?.[0]?.recommendedTrainerId;
      const res = await joinMatch({
        roomId: roomCode.trim(),
        playerName: playerName.trim(),
        deckId,
        trainerId,
      });
      if (res.error) throw new Error(res.error);
      setMultiplayerSession({ roomId: res.roomId, playerToken: res.playerToken, viewerSide: res.viewerSide });
      onStartLoadout({ mode: "online", roomId: res.roomId, joinedState: res });
    } catch (e) {
      setErr(e.message || String(e));
    }
  }

  return (
    <div className="screen" style={{ background: "radial-gradient(ellipse at 50% 0%, #0F1B3D, #060A12)" }}>
      <ParticleBG intensity={0.6} />
      <div style={{ position: "relative", zIndex: 1, padding: "20px 20px 0" }}>
        <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: 2 }}>⬡ ARENA LOBBY</h2>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>Solo vs AI uses the Spring Boot game server on the same API base.</p>
      </div>
      <div style={{ position: "relative", zIndex: 1, flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="glass" style={{ padding: 16 }}>
          <label style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'Rajdhani', sans-serif", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, display: "block" }}>
            Display name
          </label>
          <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Your name" maxLength={24} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            ["solo", "Solo vs AI", "🤖"],
            ["online", "Online", "🌐"],
          ].map(([key, label, icon]) => (
            <button
              key={key}
              type="button"
              className="btn"
              onClick={() => setLobbyMode(key)}
              style={{
                flex: 1,
                flexDirection: "column",
                gap: 4,
                padding: "16px 12px",
                background: lobbyMode === key ? "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(6,182,212,0.15))" : "rgba(12,18,32,0.5)",
                borderColor: lobbyMode === key ? "var(--accent-blue)" : "var(--border-dim)",
              }}
            >
              <span style={{ fontSize: 24 }}>{icon}</span>
              <span style={{ fontSize: 12 }}>{label}</span>
            </button>
          ))}
        </div>
        {lobbyMode === "online" && (
          <div className="glass" style={{ padding: 16, animation: "fadeIn 0.3s" }}>
            <p style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 12, lineHeight: 1.4 }}>
              Host a match from the main SiegelingsTCG web app, then paste the room code here to join with your chosen loadout on the next screen.
            </p>
            <button type="button" className="btn sm primary" style={{ width: "100%", marginBottom: 12 }} onClick={handleJoin}>
              Join room
            </button>
            <input value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} placeholder="Room code" style={{ fontFamily: "'Orbitron', sans-serif", letterSpacing: 2 }} />
            {err && <p style={{ color: "#f87171", fontSize: 12, marginTop: 8 }}>{err}</p>}
          </div>
        )}
        <div className="glass" style={{ padding: 16 }}>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: 1, color: "var(--accent-gold)", marginBottom: 12 }}>
            🏆 Wins (server leaderboard snapshot)
          </div>
          {winsBoard.length === 0 && <div style={{ fontSize: 12, color: "var(--text-dim)" }}>No data or API offline.</div>}
          {winsBoard.map((p, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < winsBoard.length - 1 ? "1px solid var(--border-dim)" : "none" }}>
              <span style={{ fontSize: 13 }}>
                <span style={{ color: "var(--accent-gold)", fontWeight: 700, marginRight: 8 }}>#{p.rank}</span>
                {p.displayName}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{p.value}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: "relative", zIndex: 1, padding: "16px 20px 28px" }}>
        <button className="btn primary" onClick={() => onStartLoadout({ mode: lobbyMode })} style={{ width: "100%", padding: 16, fontSize: 16 }}>
          Choose loadout →
        </button>
      </div>
    </div>
  );
}

function LoadoutScreen({
  gameOptions,
  loading,
  optionsError,
  matchStartError,
  startingMatch,
  onBack,
  onStartMatch,
  defaultDeckId,
  defaultTrainerId,
}) {
  const [tab, setTab] = useState("presets");
  const [selectedDeck, setSelectedDeck] = useState(0);
  const [selectedTrainer, setSelectedTrainer] = useState(0);
  const decks = gameOptions?.decks || [];
  const trainers = gameOptions?.trainers || [];

  useEffect(() => {
    if (!decks.length) return;
    const idx = Math.max(
      0,
      decks.findIndex((d) => d.id === defaultDeckId)
    );
    setSelectedDeck(idx >= 0 ? idx : 0);
  }, [defaultDeckId, decks]);

  useEffect(() => {
    if (!trainers.length) return;
    const tid = decks[selectedDeck]?.recommendedTrainerId || defaultTrainerId;
    const idx = Math.max(0, trainers.findIndex((t) => t.id === tid));
    setSelectedTrainer(idx >= 0 ? idx : 0);
  }, [defaultTrainerId, decks, selectedDeck, trainers]);

  const deck = decks[selectedDeck];
  const trainer = trainers[selectedTrainer];
  const knEl = trainer ? elStyle(trainer.element) : elStyle("NEUTRAL");

  if (loading) {
    return (
      <div className="screen" style={{ alignItems: "center", justifyContent: "center", background: "var(--bg-deep)" }}>
        <ParticleBG intensity={0.3} />
        <div style={{ zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 18, padding: 24 }}>
          <div className="spinner" />
          <p style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 16, fontWeight: 600 }}>Loading deck catalog…</p>
          <p style={{ fontSize: 12, color: "var(--text-dim)", maxWidth: 300, textAlign: "center", lineHeight: 1.5 }}>
            Fetching <code style={{ color: "var(--accent-cyan)" }}>/api/game/options</code> from the server. With Vite dev, the API must be on port{" "}
            <strong>8080</strong>.
          </p>
        </div>
      </div>
    );
  }

  if (optionsError) {
    return (
      <div className="screen" style={{ alignItems: "center", justifyContent: "center", background: "var(--bg-deep)", padding: 24 }}>
        <p style={{ color: "#f87171", zIndex: 1, textAlign: "center" }}>{optionsError}</p>
        <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 12, textAlign: "center", maxWidth: 320 }}>
          Run the SiegelingsTCG Spring Boot app on port 8080, or set <code>VITE_API_BASE</code> to your API origin, then reload.
        </p>
        <button type="button" className="btn sm primary" style={{ marginTop: 16, zIndex: 1 }} onClick={onBack}>
          Back
        </button>
      </div>
    );
  }

  const canStart = Boolean(deck && trainer);

  return (
    <div className="screen" style={{ background: "var(--bg-deep)" }}>
      <ParticleBG intensity={0.4} />
      <div style={{ position: "relative", zIndex: 1, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border-dim)" }}>
        <button type="button" className="btn sm" onClick={onBack}>
          ← Back
        </button>
        <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 14, fontWeight: 700 }}>LOADOUT</span>
        <div style={{ width: 70 }} />
      </div>
      <div style={{ position: "relative", zIndex: 1, flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {matchStartError && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 10,
              border: "1px solid rgba(248,113,113,0.4)",
              background: "rgba(127,29,29,0.25)",
              fontSize: 13,
              color: "#fecaca",
            }}
          >
            {matchStartError}
          </div>
        )}
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 13, fontWeight: 600, color: "var(--text-dim)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
            SiegeKnight (trainer)
          </h3>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
            {trainers.map((t, i) => {
              const e = elStyle(t.element);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTrainer(i)}
                  style={{
                    minWidth: 90,
                    padding: "12px 10px",
                    borderRadius: 12,
                    textAlign: "center",
                    background: selectedTrainer === i ? `linear-gradient(160deg, ${e.color}25, ${e.color}08)` : "var(--bg-card)",
                    border: `1.5px solid ${selectedTrainer === i ? e.color : "var(--border-dim)"}`,
                    cursor: "pointer",
                    color: "inherit",
                    font: "inherit",
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 4 }}>{e.icon}</div>
                  <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 13, color: e.color }}>{t.name}</div>
                </button>
              );
            })}
          </div>
          {trainer && (
            <div className="glass" style={{ padding: 12, marginTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>{knEl.icon}</span>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 14, fontWeight: 700, color: knEl.color }}>{trainer.name}</span>
              </div>
              {trainer.passive && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{trainer.passive}</div>}
              {trainer.active && <div style={{ fontSize: 11, color: "var(--accent-gold)", marginTop: 4 }}>{trainer.active}</div>}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 0, marginBottom: 12, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border-dim)" }}>
          {[
            ["presets", "Presets"],
            ["builder", "Builder note"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              style={{
                flex: 1,
                padding: "10px",
                border: "none",
                cursor: "pointer",
                background: tab === key ? "rgba(59,130,246,0.15)" : "var(--bg-card)",
                color: tab === key ? "var(--accent-blue)" : "var(--text-secondary)",
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "presets" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {decks.map((d, i) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDeck(i)}
                className="glass"
                style={{
                  padding: 14,
                  cursor: "pointer",
                  textAlign: "left",
                  color: "inherit",
                  font: "inherit",
                  borderColor: selectedDeck === i ? "var(--accent-blue)" : "var(--border-dim)",
                }}
              >
                <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 15 }}>{d.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>{d.description}</div>
                <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 6, textTransform: "uppercase" }}>
                  {(d.elements || []).join(" · ")}
                </div>
              </button>
            ))}
          </div>
        )}
        {tab === "builder" && (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Custom decks are supported by the API via <code style={{ color: "var(--accent-cyan)" }}>customDeckCards</code> on{" "}
            <code>/api/game/new</code>. Use the main web client’s deck builder to construct a list, then paste IDs here in a future
            update — or stay on presets for now.
          </p>
        )}
      </div>
      <div style={{ position: "relative", zIndex: 1, padding: "12px 20px 28px" }}>
        {!deck || !trainers.length ? (
          <p style={{ fontSize: 12, color: "#f87171", textAlign: "center", marginBottom: 8 }}>No decks or trainers loaded from the server. Check the API.</p>
        ) : null}
        {trainers.length > 0 && decks.length > 0 && !canStart ? (
          <p style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", marginBottom: 10 }}>Select a deck and a SiegeKnight above.</p>
        ) : null}
        <button
          type="button"
          className="btn primary"
          disabled={!canStart || startingMatch}
          onClick={() => onStartMatch(deck?.id, trainer?.id, deck?.name, trainer?.name)}
          style={{ width: "100%", padding: 16, fontSize: 16 }}
        >
          {startingMatch ? "Starting…" : "⚔ Start match"}
        </button>
        <p style={{ fontSize: 10, color: "var(--text-dim)", textAlign: "center", marginTop: 10, lineHeight: 1.4 }}>
          Solo match calls <code style={{ color: "var(--accent-cyan)" }}>POST /api/game/new</code> — backend must be running.
        </p>
      </div>
    </div>
  );
}

function MulliganScreen({ hand, onKeep, onRedraw, selected, toggle, busy }) {
  return (
    <div
      className="screen"
      style={{
        background: "radial-gradient(ellipse at 50% 60%, #0F1B3D, #060A12)",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
      }}
    >
      <ParticleBG intensity={0.5} />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          padding: "24px 20px",
          width: "100%",
          minHeight: "100%",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>OPENING HAND</h2>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 24 }}>Keep all, or tap cards to replace (server indices)</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 32 }}>
          {hand.map((c, i) => (
            <div key={`${c.id}-${i}`} style={{ animation: `cardDraw 0.4s ${i * 0.08}s both` }}>
              <ServerCard card={c} small selected={selected.has(i)} onTap={busy ? undefined : () => toggle(i)} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" className="btn primary" onClick={onKeep} disabled={busy} style={{ minWidth: 130 }}>
            {busy ? "…" : "Keep hand"}
          </button>
          <button type="button" className="btn gold" onClick={onRedraw} disabled={busy || selected.size === 0} style={{ minWidth: 130 }}>
            Replace ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}

function BoardPanel({ board, title, side, onCellTap, highlight }) {
  const hl = highlight instanceof Set ? highlight : new Set();
  return (
    <div style={{ flex: 1, padding: "8px", position: "relative" }}>
      <div style={{ position: "absolute", top: 4, left: 8, fontSize: 10, color: "var(--text-dim)", fontFamily: "'Rajdhani', sans-serif", letterSpacing: 1 }}>{title}</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 6,
          marginTop: 20,
          maxWidth: 280,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {[0, 1, 2].map((row) =>
          [0, 1, 2].map((col) => {
            const cell = board?.[row]?.[col];
            const key = `${row}-${col}`;
            const isHl = hl.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onCellTap && onCellTap(row, col, side)}
                style={{
                  aspectRatio: "1",
                  borderRadius: 8,
                  border: `1px solid ${isHl ? "var(--accent-cyan)" : "var(--border-dim)"}`,
                  background: cell ? "rgba(30,40,60,0.9)" : "rgba(12,18,32,0.5)",
                  padding: 4,
                  cursor: onCellTap ? "pointer" : "default",
                  color: "inherit",
                  font: "inherit",
                  overflow: "hidden",
                }}
              >
                {cell ? (
                  <div style={{ fontSize: 9, textAlign: "center", position: "relative", width: "100%", height: "100%", minHeight: 0 }}>
                    <BoardNotches notches={cell.notches} />
                    <div style={{ position: "relative", zIndex: 5, paddingTop: 2 }}>
                      <div style={{ fontWeight: 700, color: elStyle(cell.element).color }}>{cell.name}</div>
                      <div style={{ color: "#94a3b8" }}>
                        ♥{cell.hp}/{cell.maxHp} · SPD {cell.spd}
                      </div>
                    </div>
                  </div>
                ) : (
                  <span style={{ fontSize: 10, color: "var(--text-dim)" }}>—</span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function ArenaScreen({ gameState, setGameState, playerName, onError }) {
  const [selectedHandIndex, setSelectedHandIndex] = useState(null);
  const [placements, setPlacements] = useState([]);
  const [showLog, setShowLog] = useState(false);
  const [targetMode, setTargetMode] = useState(null);

  const phase = gameState?.currentPhase;
  const playerActive = gameState?.activeSide === "PLAYER";
  const hand = gameState?.player?.hand || [];
  const selectedCard = selectedHandIndex != null ? hand[selectedHandIndex] : null;

  const refresh = useCallback(async () => {
    try {
      const s = await getGameState({ omitMultiplayerHeaders: gameState?.multiplayer !== true });
      if (s.error) return;
      setGameState(s);
    } catch (_) {}
  }, [setGameState, gameState?.multiplayer]);

  useEffect(() => {
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!gameState?.pendingBattle) setTargetMode(null);
  }, [gameState?.pendingBattle]);

  useEffect(() => {
    let cancelled = false;
    async function loadPlacements() {
      if (phase !== "SETUP" || !selectedCard || (selectedCard.type || "").toUpperCase() !== "SIEGLING" || !playerActive) {
        setPlacements([]);
        return;
      }
      try {
        const data = await getPlacements({ omitMultiplayerHeaders: gameState?.multiplayer !== true });
        if (!cancelled && Array.isArray(data)) setPlacements(data);
      } catch {
        if (!cancelled) setPlacements([]);
      }
    }
    loadPlacements();
    return () => {
      cancelled = true;
    };
  }, [phase, selectedCard, playerActive, gameState?.turnNumber, gameState?.multiplayer]);

  const placementSet = new Set(placements.map(([r, c]) => `${r}-${c}`));
  const enemyTargetHighlight = new Set();
  if (targetMode && (targetMode.targetType || "").includes("ENEMY")) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) enemyTargetHighlight.add(`${r}-${c}`);
  }
  const allyTargetHighlight = new Set();
  if (targetMode && (targetMode.targetType || "").includes("ALLY")) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) allyTargetHighlight.add(`${r}-${c}`);
  }

  const mpOpts = { omitMultiplayerHeaders: gameState?.multiplayer !== true };

  async function doDraw() {
    try {
      const s = await apiGame("draw", "POST", null, mpOpts);
      setGameState(s);
    } catch (e) {
      onError(e.message);
    }
  }

  async function doEndTurn() {
    try {
      const s = await apiGame("endturn", "POST", null, mpOpts);
      setGameState(s);
    } catch (e) {
      onError(e.message);
    }
  }

  async function doPlace(row, col) {
    if (!selectedCard) return;
    try {
      const s = await apiGame("place", "POST", { cardId: selectedCard.id, row, col }, mpOpts);
      setSelectedHandIndex(null);
      setGameState(s);
    } catch (e) {
      onError(e.message);
    }
  }

  async function doBattleAction(abilityIndex, targetRow, targetCol) {
    try {
      const s = await apiGame("battle/action", "POST", { abilityIndex, targetRow, targetCol }, mpOpts);
      setTargetMode(null);
      setGameState(s);
    } catch (e) {
      onError(e.message);
    }
  }

  function onBoardTap(row, col, side) {
    if (phase === "BATTLE" && targetMode != null) {
      const tr = side === "enemy" ? row : -1;
      const tc = side === "enemy" ? col : -1;
      const ar = side === "player" ? row : -1;
      const ac = side === "player" ? col : -1;
      const tt = targetMode.targetType || "";
      if (tt.includes("ENEMY") && side === "enemy") doBattleAction(targetMode.abilityIndex, tr, tc);
      else if (tt.includes("ALLY") && side === "player") doBattleAction(targetMode.abilityIndex, ar, ac);
      return;
    }
    if (phase === "SETUP" && playerActive && selectedCard && placementSet.has(`${row}-${col}`)) {
      doPlace(row, col);
    }
  }

  const pb = gameState?.pendingBattle;
  const enemyHp = gameState?.enemy?.health ?? 0;
  const playerHp = gameState?.player?.health ?? 0;

  return (
    <div className="screen" style={{ background: "var(--bg-deep)" }}>
      <div style={{ position: "relative", zIndex: 2, background: "linear-gradient(180deg, rgba(12,18,32,0.95), transparent)", padding: "10px 12px 6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{gameState?.enemyName || "Enemy"}</div>
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 18, fontWeight: 700, color: enemyHp <= 20 ? "#f87171" : "var(--text-primary)" }}>{enemyHp} HP</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--text-dim)" }}>T{gameState?.turnNumber}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent-cyan)" }}>{phase}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{playerName}</div>
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 18, fontWeight: 700, color: playerHp <= 20 ? "#f87171" : "var(--text-primary)" }}>{playerHp} HP</div>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, position: "relative", zIndex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <BoardPanel title="ENEMY" board={gameState?.enemyBoard} side="enemy" onCellTap={onBoardTap} highlight={enemyTargetHighlight} />
        <div style={{ height: 1, background: "linear-gradient(90deg, transparent, var(--border-glow), transparent)", margin: "0 16px" }} />
        <BoardPanel
          title="YOU"
          board={gameState?.playerBoard}
          side="player"
          onCellTap={onBoardTap}
          highlight={targetMode && (targetMode.targetType || "").includes("ALLY") ? allyTargetHighlight : phase === "SETUP" ? placementSet : new Set()}
        />
      </div>
      {phase === "BATTLE" && pb && (
        <div style={{ padding: "8px 12px", background: "rgba(30,20,40,0.9)", borderTop: "1px solid var(--border-dim)", zIndex: 2,
          maxHeight: "28vh", overflowY: "auto" }}>
          <div style={{ fontSize: 11, color: "var(--accent-gold)", marginBottom: 6 }}>Battle — {pb.name}</div>
          {(pb.abilities || []).map((ab) => (
            <button
              key={ab.index}
              type="button"
              className="btn sm"
              style={{ width: "100%", marginBottom: 6, justifyContent: "flex-start" }}
              disabled={!ab.affordable}
              onClick={() => {
                const tt = ab.targetType || "";
                if (tt === "PASSIVE" || tt === "SELF" || !tt) doBattleAction(ab.index, -1, -1);
                else if (tt.includes("ENEMY") && tt !== "ALL_ENEMIES" && tt !== "ENEMY_PLAYER") setTargetMode({ abilityIndex: ab.index, targetType: tt });
                else if (tt.includes("ALLY") && tt !== "ALL_ALLIES") setTargetMode({ abilityIndex: ab.index, targetType: tt });
                else doBattleAction(ab.index, -1, -1);
              }}
            >
              {ab.name} — {ab.description?.slice(0, 60)}
              {!ab.affordable && " (cost)"}
            </button>
          ))}
          {targetMode && <div style={{ fontSize: 12, color: "var(--accent-cyan)", marginTop: 4 }}>Tap a board cell to target…</div>}
        </div>
      )}
      <div style={{ position: "relative", zIndex: 2, background: "var(--bg-surface)", borderTop: "1px solid var(--border-dim)", padding: "8px 10px 4px" }}>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          {hand.map((c, idx) => (
            <ServerCard
              key={`${c.id}-${idx}`}
              card={c}
              small
              selected={selectedHandIndex === idx}
              onTap={() => setSelectedHandIndex(selectedHandIndex === idx ? null : idx)}
            />
          ))}
        </div>
      </div>
      <div style={{ position: "relative", zIndex: 2, background: "var(--bg-surface)", padding: "8px 12px 24px", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", borderTop: "1px solid var(--border-dim)" }}>
        <button type="button" className="btn sm primary" disabled={!playerActive || phase !== "DRAW"} onClick={doDraw}>
          Draw
        </button>
        <button type="button" className="btn sm gold" disabled={!playerActive || phase !== "SETUP"} onClick={doEndTurn}>
          Pass / end setup
        </button>
        <button type="button" className="btn sm" onClick={() => setShowLog(true)}>
          Log
        </button>
        <button type="button" className="btn sm" onClick={refresh}>
          Refresh
        </button>
      </div>
      {showLog && (
        <button
          type="button"
          style={{ position: "fixed", inset: 0, zIndex: 200, border: "none", background: "rgba(0,0,0,0.75)", color: "inherit", textAlign: "left", padding: 20, overflowY: "auto" }}
          onClick={() => setShowLog(false)}
        >
          <div className="glass" style={{ padding: 16, maxWidth: 400, margin: "0 auto" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 14, marginBottom: 12 }}>Game log</h3>
            {(gameState?.gameLog || []).slice(0, 40).map((line, i) => (
              <div key={i} style={{ fontSize: 11, color: i === 0 ? "var(--text-primary)" : "var(--text-secondary)", padding: "6px 0", borderBottom: "1px solid var(--border-dim)" }}>
                {line}
              </div>
            ))}
          </div>
        </button>
      )}
    </div>
  );
}

function GameOverScreen({ won, onLobby }) {
  return (
    <div className="screen" style={{ background: won ? "radial-gradient(ellipse at 50% 40%, #0F2D1F, #060A12)" : "radial-gradient(ellipse at 50% 40%, #2D0F0F, #060A12)", alignItems: "center", justifyContent: "center" }}>
      <ParticleBG intensity={won ? 1.2 : 0.4} />
      <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>{won ? "🏆" : "💀"}</div>
        <h1 style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 900, fontSize: 28, letterSpacing: 3, color: won ? "#22C55E" : "#EF4444" }}>{won ? "VICTORY" : "DEFEAT"}</h1>
        <div style={{ width: 220, margin: "32px auto 0", display: "flex", flexDirection: "column", gap: 12 }}>
          <button type="button" className="btn primary" onClick={onLobby} style={{ width: "100%" }}>
            Back to lobby
          </button>
        </div>
      </div>
    </div>
  );
}

const LOADING_GATE_FLAVOR = [
  "Siegelings feed on raw elemental energy.",
  "A SiegeKnight never retreats from the arena.",
  "Element advantage changes everything.",
  "Every notch you link decides what spells you can cast.",
  "The crown belongs to whoever holds the field.",
  "Beware the silence between phases.",
];

function LoadingGateKnight({ info, side }) {
  const el = elStyle(info?.element);
  const isRight = side === "right";
  return (
    <div
      style={{
        position: "relative",
        background: `linear-gradient(160deg, ${el.color}26, ${el.color}08, var(--bg-card))`,
        border: `1.5px solid ${el.color}90`,
        borderRadius: 14,
        padding: "18px 12px 14px",
        textAlign: "center",
        boxShadow: `0 0 28px ${el.color}40, inset 0 0 24px ${el.color}1a`,
        animation: `slideUp 0.45s cubic-bezier(0.2,0.8,0.3,1) ${isRight ? "0.12s" : "0s"} both`,
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 50% 30%, ${el.color}33, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: 44, marginBottom: 6, color: el.color, textShadow: `0 0 18px ${el.color}aa` }}>{el.icon}</div>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 14, fontWeight: 800, letterSpacing: 1, color: "var(--text-primary)" }}>
          {info?.trainerName || (isRight ? "Opponent" : "Player")}
        </div>
        {info?.name && info.name !== info.trainerName && (
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
            {info.name}
          </div>
        )}
        <div
          style={{
            marginTop: 8,
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: 999,
            fontSize: 9,
            fontFamily: "'Orbitron', sans-serif",
            letterSpacing: 2,
            color: el.color,
            textTransform: "uppercase",
            border: `1px solid ${el.color}66`,
            background: `${el.color}12`,
          }}
        >
          {el.name}
        </div>
      </div>
    </div>
  );
}

function LoadingGateScreen({ player, opponent }) {
  const [flavorIdx, setFlavorIdx] = useState(0);
  const [pct, setPct] = useState(6);

  useEffect(() => {
    setFlavorIdx(Math.floor(Math.random() * LOADING_GATE_FLAVOR.length));
    const id = setInterval(() => {
      setFlavorIdx((i) => (i + 1) % LOADING_GATE_FLAVOR.length);
    }, 2600);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setPct((p) => {
        if (p >= 92) return p;
        return Math.min(92, p + (92 - p) * 0.08 + Math.random() * 1.4);
      });
    }, 220);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="screen"
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        background: "radial-gradient(ellipse at 50% 40%, #0F1B3D, #060A12)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ParticleBG intensity={0.9} />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 480,
          padding: "0 20px",
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <p
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 11,
              color: "var(--text-dim)",
              letterSpacing: 4,
              textTransform: "uppercase",
            }}
          >
            SiegeKnight Gate
          </p>
          <h1
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 900,
              fontSize: 26,
              letterSpacing: 5,
              marginTop: 4,
            }}
          >
            SIEGLINGS
          </h1>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10 }}>
          <LoadingGateKnight info={player} side="left" />
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(245,158,11,0.4), rgba(245,158,11,0.05))",
              border: "1.5px solid rgba(245,158,11,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "'Orbitron', sans-serif",
              fontWeight: 900,
              color: "var(--accent-gold)",
              fontSize: 18,
              letterSpacing: 1,
              boxShadow: "0 0 24px rgba(245,158,11,0.35)",
              animation: "pulse 1.8s ease-in-out infinite",
            }}
          >
            VS
          </div>
          <LoadingGateKnight info={opponent} side="right" />
        </div>
        <div>
          <div
            style={{
              position: "relative",
              width: "100%",
              height: 6,
              background: "rgba(100,140,200,0.15)",
              borderRadius: 3,
              overflow: "hidden",
              border: "1px solid var(--border-dim)",
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                background: "linear-gradient(90deg, var(--accent-blue), var(--accent-cyan))",
                transition: "width 0.25s ease-out",
                boxShadow: "0 0 12px rgba(6,182,212,0.6)",
              }}
            />
          </div>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              textAlign: "center",
              marginTop: 14,
              fontStyle: "italic",
              minHeight: 16,
            }}
          >
            {LOADING_GATE_FLAVOR[flavorIdx]}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("splash");
  const [playerName, setPlayerName] = useState("Player");
  const [lobbyMode, setLobbyMode] = useState("solo");
  const [gameOptions, setGameOptions] = useState(null);
  const [optionsLoadError, setOptionsLoadError] = useState("");
  const [matchStartError, setMatchStartError] = useState("");
  const [startingMatch, setStartingMatch] = useState(false);
  const [mulliganBusy, setMulliganBusy] = useState(false);
  const [loadoutLoading, setLoadoutLoading] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [mulliganPick, setMulliganPick] = useState(() => new Set());
  const [toast, setToast] = useState("");
  const [won, setWon] = useState(false);
  const [roomInfo, setRoomInfo] = useState(null);
  const [loadingGateInfo, setLoadingGateInfo] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3200);
  };

  useEffect(() => {
    if (screen === "arena" && gameState?.gameOver) {
      setWon(gameState.winner === gameState.playerName);
      setScreen("gameover");
    }
  }, [gameState, screen]);

  useEffect(() => {
    prefetchGameOptions();
  }, []);

  useEffect(() => {
    if (screen !== "lobby") return;
    prefetchGameOptions();
  }, [screen]);

  async function enterLoadout() {
    setOptionsLoadError("");
    setMatchStartError("");
    setScreen("loadout");
    const warm = peekCachedGameOptions();
    if (warm?.decks?.length) {
      setGameOptions(warm);
      setLoadoutLoading(false);
    } else {
      setGameOptions(null);
      setLoadoutLoading(true);
    }
    try {
      const o = await getGameOptions();
      setGameOptions(o);
    } catch (e) {
      setOptionsLoadError(e.message || "Failed to load /api/game/options");
    } finally {
      setLoadoutLoading(false);
    }
  }

  async function startMatch(deckId, trainerId, deckName, trainerName) {
    setMatchStartError("");
    setStartingMatch(true);
    const trainer = gameOptions?.trainers?.find((t) => t.id === trainerId);
    setLoadingGateInfo({
      player: {
        name: playerName || "Player",
        element: trainer?.element || "NEUTRAL",
        trainerName: trainer?.name || trainerName || "SiegeKnight",
      },
      opponent: {
        name: roomInfo?.mode === "online" ? "Online rival" : "AI Adversary",
        element: "NEUTRAL",
        trainerName: roomInfo?.mode === "online" ? "Awaiting…" : "AI",
      },
    });
    setScreen("loadingGate");
    const startedAt = performance.now();
    const minDurationMs = 1500;
    const awaitMin = async () => {
      const remaining = minDurationMs - (performance.now() - startedAt);
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
    };
    try {
      if (roomInfo?.mode === "online" && multiplayerSession?.roomId) {
        const st = await getMatchStatus();
        if (st.error) throw new Error(st.error);
        if (st.started && st.currentPhase) {
          await awaitMin();
          setGameState(st);
          if (st.mulligan?.youPending && st.currentPhase === "MULLIGAN") {
            setMulliganPick(new Set());
            setScreen("mulligan");
          } else setScreen("arena");
          return;
        }
        showToast("Waiting for opponent…");
        await awaitMin();
        setScreen("roomwait");
        return;
      }
      clearMultiplayerSession();
      const body = {
        deckId,
        trainerId,
        loadoutLabel: `${deckName || deckId} · ${trainerName || trainerId}`,
      };
      const data = await apiGame("new", "POST", body, { omitMultiplayerHeaders: true });
      await awaitMin();
      setGameState(data);
      if (data.mulligan?.youPending && data.currentPhase === "MULLIGAN") {
        setMulliganPick(new Set());
        setScreen("mulligan");
      } else {
        setScreen("arena");
      }
    } catch (e) {
      setMatchStartError(e.message || String(e));
      setScreen("loadout");
    } finally {
      setStartingMatch(false);
    }
  }

  async function submitMulligan(indices) {
    setMulliganBusy(true);
    try {
      const data = await apiGame(
        "mulligan",
        "POST",
        { mulliganIndices: indices },
        { omitMultiplayerHeaders: gameState?.multiplayer !== true }
      );
      setGameState(data);
      setScreen("arena");
    } catch (e) {
      showToast(e.message || "Mulligan failed");
    } finally {
      setMulliganBusy(false);
    }
  }

  return (
    <>
      <GlobalStyles />
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: 16, right: 16, zIndex: 300, background: "rgba(15,23,42,0.95)", border: "1px solid var(--border-glow)", borderRadius: 12, padding: 12, fontSize: 13, textAlign: "center" }}>
          {toast}
        </div>
      )}
      {screen === "splash" && (
        <SplashScreen
          onEnter={() => {
            prefetchGameOptions();
            setScreen("lobby");
          }}
        />
      )}
      {screen === "lobby" && (
        <LobbyScreen
          onStartLoadout={(meta) => {
            setRoomInfo(meta);
            const st = meta.joinedState;
            if (st?.currentPhase && st.started) {
              setGameState(st);
              if (st.mulligan?.youPending && st.currentPhase === "MULLIGAN") {
                setMulliganPick(new Set());
                setScreen("mulligan");
              } else {
                setScreen("arena");
              }
              return;
            }
            enterLoadout();
          }}
          playerName={playerName}
          setPlayerName={setPlayerName}
          lobbyMode={lobbyMode}
          setLobbyMode={setLobbyMode}
        />
      )}
      {screen === "loadout" && (
        <LoadoutScreen
          gameOptions={gameOptions}
          loading={loadoutLoading}
          optionsError={optionsLoadError}
          matchStartError={matchStartError}
          startingMatch={startingMatch}
          onBack={() => {
            setMatchStartError("");
            setScreen("lobby");
          }}
          onStartMatch={startMatch}
          defaultDeckId={gameOptions?.defaultDeckId}
          defaultTrainerId={gameOptions?.defaultTrainerId}
        />
      )}
      {screen === "loadingGate" && (
        <LoadingGateScreen player={loadingGateInfo?.player} opponent={loadingGateInfo?.opponent} />
      )}
      {screen === "roomwait" && (
        <div className="screen" style={{ alignItems: "center", justifyContent: "center", background: "var(--bg-deep)" }}>
          <ParticleBG />
          <p style={{ zIndex: 1, textAlign: "center", padding: 24 }}>
            Room <strong>{multiplayerSession?.roomId}</strong>
            <br />
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Share this code with your opponent. Polling…</span>
          </p>
          <button type="button" className="btn sm primary" style={{ zIndex: 1 }} onClick={() => setScreen("lobby")}>
            Cancel
          </button>
          <RoomWaitPoller
            onReady={(st) => {
              setGameState(st);
              if (st.mulligan?.youPending && st.currentPhase === "MULLIGAN") {
                setMulliganPick(new Set());
                setScreen("mulligan");
              } else setScreen("arena");
            }}
          />
        </div>
      )}
      {screen === "mulligan" && gameState?.player?.hand && (
        <MulliganScreen
          hand={gameState.player.hand}
          selected={mulliganPick}
          busy={mulliganBusy}
          toggle={(i) => {
            setMulliganPick((prev) => {
              const n = new Set(prev);
              n.has(i) ? n.delete(i) : n.add(i);
              return n;
            });
          }}
          onKeep={() => void submitMulligan([])}
          onRedraw={() => void submitMulligan([...mulliganPick].sort((a, b) => a - b))}
        />
      )}
      {screen === "arena" && gameState && (
        <ArenaScreen gameState={gameState} setGameState={setGameState} playerName={playerName} onError={showToast} />
      )}
      {screen === "gameover" && <GameOverScreen won={won} onLobby={() => { setMultiplayerSession(null); setGameState(null); setScreen("lobby"); }} />}
    </>
  );
}

function RoomWaitPoller({ onReady }) {
  const cb = useRef(onReady);
  cb.current = onReady;
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const st = await getMatchStatus();
        if (st.started && st.currentPhase) cb.current(st);
      } catch (_) {}
    }, 2000);
    return () => clearInterval(id);
  }, []);
  return null;
}
