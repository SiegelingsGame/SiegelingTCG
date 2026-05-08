/**
 * Sieglings TCG — Audio module (Howler.js)
 *
 * Synthesises short game sounds procedurally using the Web Audio API via
 * Howler sprites so we ship zero audio files. Each sound is a tiny inline
 * data URI generated once on first use.
 *
 * Call window.SieglingsSounds.play('<name>') from anywhere in game.js.
 * Respects a mute toggle stored in localStorage.
 */
(function () {
    'use strict';

    const MUTE_KEY = 'sieglingsSoundMuted';

    let muted = (() => {
        try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; }
    })();

    // ─── Procedural sound synthesis ──────────────────────────────────────────
    // Each sound is generated once as a data-URI WAV and cached.

    let _audioCtx = null;
    function getAudioCtx() {
        if (!_audioCtx) {
            try {
                _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                return null;
            }
        }
        if (_audioCtx.state === 'suspended') {
            _audioCtx.resume().catch(() => {});
        }
        return _audioCtx;
    }

    function renderBuffer(fn, durationSec = 0.35, sampleRate = 22050) {
        const ctx = getAudioCtx();
        if (!ctx) return null;
        const len = Math.ceil(sampleRate * durationSec);
        const buf = ctx.createBuffer(1, len, sampleRate);
        const data = buf.getChannelData(0);
        fn(data, sampleRate);
        return buf;
    }

    function bufferToDataUri(buf) {
        if (!buf) return null;
        const data = buf.getChannelData(0);
        const len = data.length;
        const byteCount = 44 + len * 2;
        const ab = new ArrayBuffer(byteCount);
        const view = new DataView(ab);
        const sr = buf.sampleRate;
        // WAV header
        const w = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
        w(0, 'RIFF'); view.setUint32(4, byteCount - 8, true);
        w(8, 'WAVE'); w(12, 'fmt '); view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); view.setUint16(22, 1, true);
        view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true);
        view.setUint16(32, 2, true); view.setUint16(34, 16, true);
        w(36, 'data'); view.setUint32(40, len * 2, true);
        for (let i = 0; i < len; i++) {
            view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true);
        }
        const bytes = new Uint8Array(ab);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return 'data:audio/wav;base64,' + btoa(bin);
    }

    // ─── Sound definitions ────────────────────────────────────────────────────

    const SOUNDS = {
        /** Soft card rustle — drawn from deck */
        draw(data, sr) {
            for (let i = 0; i < data.length; i++) {
                const t = i / sr;
                const env = Math.exp(-t * 14);
                data[i] = (Math.random() * 2 - 1) * env * 0.35 +
                           Math.sin(2 * Math.PI * 800 * t) * env * 0.12;
            }
        },

        /** Click + whoosh — card placed on board */
        place(data, sr) {
            for (let i = 0; i < data.length; i++) {
                const t = i / sr;
                const env = Math.exp(-t * 18);
                const click = i < sr * 0.02 ? (Math.random() * 2 - 1) * 0.6 : 0;
                const whoosh = Math.sin(2 * Math.PI * (400 - 300 * t) * t) * env * 0.25;
                data[i] = click + whoosh;
            }
        },

        /** Punchy impact — battle hit */
        hit(data, sr) {
            for (let i = 0; i < data.length; i++) {
                const t = i / sr;
                const env = Math.exp(-t * 22);
                const thud = Math.sin(2 * Math.PI * 120 * t) * env * 0.55;
                const crack = (Math.random() * 2 - 1) * Math.exp(-t * 60) * 0.4;
                data[i] = thud + crack;
            }
        },

        /** Rising tone — phase change */
        phase(data, sr) {
            for (let i = 0; i < data.length; i++) {
                const t = i / sr;
                const env = t < 0.12 ? t / 0.12 : Math.exp(-(t - 0.12) * 6);
                data[i] = Math.sin(2 * Math.PI * (300 + 400 * t) * t) * env * 0.3 +
                           Math.sin(2 * Math.PI * (600 + 200 * t) * t) * env * 0.15;
            }
        },

        /** Short descending tone — end turn */
        endturn(data, sr) {
            for (let i = 0; i < data.length; i++) {
                const t = i / sr;
                const env = Math.exp(-t * 8);
                data[i] = Math.sin(2 * Math.PI * (500 - 180 * t) * t) * env * 0.28;
            }
        },

        /** Triumphant chord — win */
        win(data, sr) {
            const freqs = [261.6, 329.6, 392, 523.3];
            for (let i = 0; i < data.length; i++) {
                const t = i / sr;
                const env = t < 0.08 ? t / 0.08 : Math.exp(-(t - 0.08) * 2.5);
                let s = 0;
                freqs.forEach((f, idx) => {
                    const delay = idx * 0.06;
                    if (t > delay) s += Math.sin(2 * Math.PI * f * (t - delay)) * (env * 0.18);
                });
                data[i] = s;
            }
        },

        /** Low descending thud — lose */
        lose(data, sr) {
            const freqs = [200, 160, 130, 110];
            for (let i = 0; i < data.length; i++) {
                const t = i / sr;
                const env = Math.exp(-t * 3);
                let s = 0;
                freqs.forEach((f, idx) => {
                    const delay = idx * 0.09;
                    if (t > delay) s += Math.sin(2 * Math.PI * f * (t - delay)) * (env * 0.2);
                });
                data[i] = s;
            }
        },

        /** Soft magical chime — spell/trap cast */
        spell(data, sr) {
            const freqs = [880, 1100, 1320];
            for (let i = 0; i < data.length; i++) {
                const t = i / sr;
                const env = Math.exp(-t * 9);
                let s = 0;
                freqs.forEach((f) => { s += Math.sin(2 * Math.PI * f * t) * env * 0.13; });
                data[i] = s;
            }
        }
    };

    const _durations = {
        draw: 0.28, place: 0.30, hit: 0.32,
        phase: 0.55, endturn: 0.30,
        win: 1.1, lose: 1.2, spell: 0.35
    };

    // Cache: sound name → AudioBuffer
    const _cache = {};

    function getBuffer(name) {
        if (_cache[name]) return _cache[name];
        const fn = SOUNDS[name];
        if (!fn) return null;
        const buf = renderBuffer(fn, _durations[name] || 0.35);
        _cache[name] = buf;
        return buf;
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    function play(name, volume = 1) {
        if (muted) return;
        const ctx = getAudioCtx();
        if (!ctx) return;
        const buf = getBuffer(name);
        if (!buf) return;
        try {
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const gain = ctx.createGain();
            gain.gain.value = Math.min(1, Math.max(0, volume));
            src.connect(gain);
            gain.connect(ctx.destination);
            src.start();
        } catch (e) {
            // silently ignore — audio context may be suspended before first interaction
        }
    }

    function setMuted(val) {
        muted = Boolean(val);
        try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
    }

    function isMuted() { return muted; }

    function toggleMute() { setMuted(!muted); return muted; }

    window.SieglingsSounds = { play, setMuted, isMuted, toggleMute };
})();
