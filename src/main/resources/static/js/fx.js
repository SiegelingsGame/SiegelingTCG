/**
 * Sieglings TCG — DOM Canvas FX Layer
 * Pure Canvas 2D. No libraries. Sits above the HTML board via a fixed transparent overlay.
 *
 * Public API (window.SieglingsFx):
 *   attackCell(fromIsPlayer, fr, fc, toIsPlayer, tr, tc, element, options)
 *   attackCells(fromIsPlayer, fr, fc, targets, element, options)
 *     targets = [{ isPlayer, row, col }, ...]
 *   impactAt(x, y, element)
 *   floatingDamage(x, y, amount, element)
 *   floatingText(x, y, text, color)
 *   cameraShake(intensity, durationMs)
 *   phaseFlash(label, element)
 *   onBoardUpdate(prevState, nextState)   ← auto-fires projectiles from HP diff
 */
(function () {
    'use strict';

    // ── Canvas setup ──────────────────────────────────────────────────────────
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:500;';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    let shakeX = 0, shakeY = 0;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    // ── RAF loop ──────────────────────────────────────────────────────────────
    const tweens = [];
    const particles = [];
    const projectiles = [];
    const floaters = [];
    const impacts = [];

    let lastTs = 0;
    function loop(ts) {
        const dt = Math.min(ts - lastTs, 60);
        lastTs = ts;

        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.translate(shakeX, shakeY);

        updateTweens(dt);
        updateProjectiles(dt);
        updateParticles(dt);
        updateImpacts(dt);
        updateFloaters(dt);

        drawParticles();
        drawImpacts();
        drawProjectiles();
        drawFloaters();

        ctx.restore();
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // ── Math helpers ──────────────────────────────────────────────────────────
    function lerp(a, b, t) { return a + (b - a) * t; }
    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
    function easeIn(t) { return t * t * t; }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function hexToRgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function rgba(hex, a) {
        const [r, g, b] = hexToRgb(hex);
        return `rgba(${r},${g},${b},${a.toFixed(3)})`;
    }
    function rgbLerp(hexA, hexB, t) {
        const [ar, ag, ab] = hexToRgb(hexA);
        const [br, bg, bb] = hexToRgb(hexB);
        const r = Math.round(lerp(ar, br, t));
        const g = Math.round(lerp(ag, bg, t));
        const b = Math.round(lerp(ab, bb, t));
        return `rgb(${r},${g},${b})`;
    }

    // ── Tweens ────────────────────────────────────────────────────────────────
    function tween(duration, step, done, delay = 0) {
        tweens.push({ duration, elapsed: -delay, step, done });
    }
    function updateTweens(dt) {
        for (let i = tweens.length - 1; i >= 0; i--) {
            const tw = tweens[i];
            tw.elapsed += dt;
            if (tw.elapsed < 0) continue;
            const t = clamp(tw.elapsed / tw.duration, 0, 1);
            tw.step(t);
            if (t >= 1) {
                if (tw.done) tw.done();
                tweens.splice(i, 1);
            }
        }
    }

    // ── Element profiles ──────────────────────────────────────────────────────
    const ELEMENTS = {
        FIRE:     { color: '#ff5520', glow: '#ff9940', trail: '#ff7730', impact: '#ff6622', arc: 70,  size: 9,  trailStyle: 'ember',   impactStyle: 'fire'    },
        WATER:    { color: '#3296ff', glow: '#80ccff', trail: '#55aaff', impact: '#3296ff', arc: 55,  size: 8,  trailStyle: 'bubble',  impactStyle: 'ripple'  },
        EARTH:    { color: '#c49a4a', glow: '#e8c870', trail: '#b08030', impact: '#c49a4a', arc: 40,  size: 11, trailStyle: 'dust',    impactStyle: 'chunk'   },
        WIND:     { color: '#64e89a', glow: '#b0ffd0', trail: '#80f0b0', impact: '#64e89a', arc: 90,  size: 7,  trailStyle: 'streak',  impactStyle: 'swirl'   },
        ICE:      { color: '#76e6ff', glow: '#c8f6ff', trail: '#a8f0ff', impact: '#76e6ff', arc: 50,  size: 8,  trailStyle: 'frost',   impactStyle: 'shatter' },
        SHADOW:   { color: '#7832b4', glow: '#c070ff', trail: '#9040d0', impact: '#7832b4', arc: 60,  size: 9,  trailStyle: 'wisp',    impactStyle: 'void'    },
        ELECTRIC: { color: '#ffe040', glow: '#ffffff', trail: '#ffe880', impact: '#ffe040', arc: 30,  size: 7,  trailStyle: 'arc',     impactStyle: 'bolt'    },
        METAL:    { color: '#a0aab4', glow: '#d8e0e8', trail: '#c0c8d0', impact: '#a0aab4', arc: 35,  size: 10, trailStyle: 'spark',   impactStyle: 'ring'    },
        UNDEAD:   { color: '#6a5080', glow: '#b090e0', trail: '#8060a0', impact: '#6a5080', arc: 65,  size: 9,  trailStyle: 'miasma',  impactStyle: 'decay'   },
        PSYCHIC:  { color: '#d060ff', glow: '#f0b0ff', trail: '#e080ff', impact: '#d060ff', arc: 80,  size: 8,  trailStyle: 'echo',    impactStyle: 'wave'    },
        NEUTRAL:  { color: '#8899aa', glow: '#aabbcc', trail: '#99aabb', impact: '#8899aa', arc: 50,  size: 8,  trailStyle: 'spark',   impactStyle: 'ring'    },
    };
    function getProfile(element) {
        return ELEMENTS[String(element || '').toUpperCase()] || ELEMENTS.NEUTRAL;
    }

    // ── Projectile drawing ────────────────────────────────────────────────────
    function drawOrbShape(x, y, r, color, glowColor, t) {
        ctx.save();
        // outer glow
        const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
        grd.addColorStop(0, rgba(glowColor, 0.55));
        grd.addColorStop(1, rgba(glowColor, 0));
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
        ctx.fill();
        // core
        const core = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
        core.addColorStop(0, '#ffffff');
        core.addColorStop(0.4, color);
        core.addColorStop(1, rgba(color, 0.7));
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawFlameShape(x, y, r, color, glowColor, t) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * Math.PI * 3);
        const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.4);
        grd.addColorStop(0, rgba(glowColor, 0.6));
        grd.addColorStop(1, rgba(glowColor, 0));
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(0, 0, r * 2.4, 0, Math.PI * 2);
        ctx.fill();
        // flickering teardrop
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.6);
        ctx.bezierCurveTo(r * 0.8, -r * 0.5, r * 0.8, r * 0.7, 0, r * 0.9);
        ctx.bezierCurveTo(-r * 0.8, r * 0.7, -r * 0.8, -r * 0.5, 0, -r * 1.6);
        const flame = ctx.createLinearGradient(0, -r * 1.6, 0, r * 0.9);
        flame.addColorStop(0, '#fff8a0');
        flame.addColorStop(0.4, color);
        flame.addColorStop(1, rgba(color, 0.4));
        ctx.fillStyle = flame;
        ctx.fill();
        ctx.restore();
    }

    function drawDropletShape(x, y, r, color, glowColor, t, angle) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle + Math.PI * 0.5);
        const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2);
        grd.addColorStop(0, rgba(glowColor, 0.4));
        grd.addColorStop(1, rgba(glowColor, 0));
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(0, 0, r * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.5);
        ctx.bezierCurveTo(r * 0.8, -r * 0.3, r, r * 0.5, 0, r);
        ctx.bezierCurveTo(-r, r * 0.5, -r * 0.8, -r * 0.3, 0, -r * 1.5);
        const drop = ctx.createLinearGradient(-r, 0, r, 0);
        drop.addColorStop(0, rgba(color, 0.8));
        drop.addColorStop(0.5, glowColor);
        drop.addColorStop(1, rgba(color, 0.8));
        ctx.fillStyle = drop;
        ctx.fill();
        ctx.restore();
    }

    function drawCrystalShape(x, y, r, color, glowColor, t) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * Math.PI * 2);
        const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.5);
        grd.addColorStop(0, rgba(glowColor, 0.5));
        grd.addColorStop(1, rgba(glowColor, 0));
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(0, 0, r * 2.5, 0, Math.PI * 2);
        ctx.fill();
        // 4-pointed star/crystal
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.4);
        ctx.lineTo(r * 0.4, 0);
        ctx.lineTo(0, r * 1.4);
        ctx.lineTo(-r * 0.4, 0);
        ctx.closePath();
        const crystal = ctx.createLinearGradient(-r, -r, r, r);
        crystal.addColorStop(0, '#f0ffff');
        crystal.addColorStop(0.5, color);
        crystal.addColorStop(1, glowColor);
        ctx.fillStyle = crystal;
        ctx.fill();
        ctx.restore();
    }

    function drawBoltShape(x, y, r, color, glowColor, t, angle) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3);
        grd.addColorStop(0, rgba(glowColor, 0.7));
        grd.addColorStop(1, rgba(glowColor, 0));
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(0, 0, r * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(r * 0.5, -r * 1.5);
        ctx.lineTo(-r * 0.2, -r * 0.1);
        ctx.lineTo(r * 0.4, -r * 0.1);
        ctx.lineTo(-r * 0.5, r * 1.5);
        ctx.lineTo(r * 0.2, r * 0.1);
        ctx.lineTo(-r * 0.4, r * 0.1);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.restore();
    }

    function drawBladeShape(x, y, r, color, glowColor, t, angle) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle + t * Math.PI * 4);
        const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2);
        grd.addColorStop(0, rgba(glowColor, 0.4));
        grd.addColorStop(1, rgba(glowColor, 0));
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(0, 0, r * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-r * 1.6, 0);
        ctx.lineTo(0, -r * 0.35);
        ctx.lineTo(r * 1.6, 0);
        ctx.lineTo(0, r * 0.35);
        ctx.closePath();
        const blade = ctx.createLinearGradient(-r * 1.6, 0, r * 1.6, 0);
        blade.addColorStop(0, rgba(color, 0.6));
        blade.addColorStop(0.5, '#f0f4ff');
        blade.addColorStop(1, rgba(color, 0.6));
        ctx.fillStyle = blade;
        ctx.fill();
        ctx.restore();
    }

    function drawVoidOrb(x, y, r, color, glowColor, t) {
        ctx.save();
        const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
        grd.addColorStop(0, rgba(glowColor, 0.5));
        grd.addColorStop(0.5, rgba(color, 0.3));
        grd.addColorStop(1, rgba(glowColor, 0));
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0a060f';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = glowColor;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(x + r * 0.25, y - r * 0.25, r * 0.28, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    function drawSkullShape(x, y, r, color, glowColor, t) {
        ctx.save();
        ctx.translate(x, y);
        const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
        grd.addColorStop(0, rgba(glowColor, 0.4));
        grd.addColorStop(1, rgba(glowColor, 0));
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, -r * 0.15, r * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.ellipse(-r * 0.3, -r * 0.2, r * 0.22, r * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(r * 0.3, -r * 0.2, r * 0.22, r * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawMindOrb(x, y, r, color, glowColor, t) {
        ctx.save();
        const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
        grd.addColorStop(0, rgba(glowColor, 0.6));
        grd.addColorStop(1, rgba(glowColor, 0));
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
        ctx.fill();
        const core = ctx.createRadialGradient(x, y, 0, x, y, r);
        core.addColorStop(0, '#fff0ff');
        core.addColorStop(1, color);
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        // orbiting ring
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * Math.PI * 3);
        ctx.strokeStyle = rgba(glowColor, 0.8);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.5, r * 0.4, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        ctx.restore();
    }

    function drawChunkShape(x, y, r, color, glowColor, t) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * Math.PI * 2);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.1);
        ctx.lineTo(r * 0.9, -r * 0.4);
        ctx.lineTo(r * 0.8, r * 0.7);
        ctx.lineTo(0, r * 1.0);
        ctx.lineTo(-r * 0.9, r * 0.5);
        ctx.lineTo(-r * 0.8, -r * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = rgba(glowColor, 0.5);
        ctx.beginPath();
        ctx.moveTo(-r * 0.3, -r * 0.9);
        ctx.lineTo(r * 0.4, -r * 0.6);
        ctx.lineTo(r * 0.2, r * 0.2);
        ctx.lineTo(-r * 0.4, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function drawGustShape(x, y, r, color, glowColor, t, angle) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.8);
        grd.addColorStop(0, rgba(glowColor, 0.4));
        grd.addColorStop(1, rgba(glowColor, 0));
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(0, 0, r * 2.8, 0, Math.PI * 2);
        ctx.fill();
        // crescent shape
        ctx.fillStyle = rgba(color, 0.9);
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0a140a';
        ctx.beginPath();
        ctx.arc(r * 0.35, 0, r * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Master projectile shape dispatcher
    function drawProjectileShape(el, x, y, r, t, angle) {
        const { color, glow } = el;
        switch (el.trailStyle) {
            case 'ember':   drawFlameShape(x, y, r, color, glow, t); break;
            case 'bubble':  drawDropletShape(x, y, r, color, glow, t, angle); break;
            case 'dust':    drawChunkShape(x, y, r, color, glow, t); break;
            case 'streak':  drawGustShape(x, y, r, color, glow, t, angle); break;
            case 'frost':   drawCrystalShape(x, y, r, color, glow, t); break;
            case 'wisp':    drawVoidOrb(x, y, r, color, glow, t); break;
            case 'arc':     drawBoltShape(x, y, r, color, glow, t, angle); break;
            case 'spark':   drawBladeShape(x, y, r, color, glow, t, angle); break;
            case 'miasma':  drawSkullShape(x, y, r, color, glow, t); break;
            case 'echo':    drawMindOrb(x, y, r, color, glow, t); break;
            default:        drawOrbShape(x, y, r, color, glow, t); break;
        }
    }

    // ── Particles ─────────────────────────────────────────────────────────────
    function spawnTrailParticle(el, x, y, style) {
        const spread = (Math.random() - 0.5) * 10;
        const size = el.size * (0.25 + Math.random() * 0.25);
        const life = 180 + Math.random() * 120;
        const vx = (Math.random() - 0.5) * 1.5;
        let vy = -1 - Math.random() * 1.5;
        if (style === 'bubble') vy = -0.5 - Math.random();
        if (style === 'dust') { vy = -0.3; }
        if (style === 'streak') { vy = (Math.random() - 0.5) * 2; }

        particles.push({
            x: x + spread, y: y + spread, vx, vy,
            size, color: el.trail, life, maxLife: life,
            style
        });
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life -= dt;
            p.x += p.vx * dt * 0.06;
            p.y += p.vy * dt * 0.06;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const a = clamp(p.life / p.maxLife, 0, 1);
            ctx.globalAlpha = a * 0.85;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            if (p.style === 'frost' || p.style === 'spark') {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.life * 0.05);
                ctx.fillRect(-p.size * 0.5, -p.size * 0.5, p.size, p.size);
                ctx.restore();
            } else if (p.style === 'arc') {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.fillRect(-p.size * 0.15, -p.size, p.size * 0.3, p.size * 2);
                ctx.restore();
            } else {
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    }

    // ── Projectiles ───────────────────────────────────────────────────────────
    function arcPoint(from, to, arcH, t) {
        const x = lerp(from.x, to.x, t);
        const y = lerp(from.y, to.y, t) - Math.sin(Math.PI * t) * arcH;
        return { x, y };
    }

    let trailTimers = new WeakMap();

    function updateProjectiles(dt) {
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            if (p.delay > 0) { p.delay -= dt; continue; }
            p.elapsed += dt;
            const t = clamp(p.elapsed / p.duration, 0, 1);
            const et = easeOut(t);

            const prev = arcPoint(p.from, p.to, p.arc, Math.max(0, et - 0.02));
            const cur  = arcPoint(p.from, p.to, p.arc, et);
            p.cur = cur;
            p.angle = Math.atan2(cur.y - prev.y, cur.x - prev.x);

            // trail spawn
            const interval = p.el.trailStyle === 'arc' ? 14 : (p.el.trailStyle === 'ember' ? 18 : 24);
            const timer = (trailTimers.get(p) || 0) + dt;
            if (timer >= interval) {
                spawnTrailParticle(p.el, cur.x, cur.y, p.el.trailStyle);
                trailTimers.set(p, 0);
            } else {
                trailTimers.set(p, timer);
            }

            if (t >= 1) {
                if (p.onHit) p.onHit(cur.x, cur.y);
                spawnImpact(cur.x, cur.y, p.el);
                projectiles.splice(i, 1);
            }
        }
    }

    function drawProjectiles() {
        for (const p of projectiles) {
            if (!p.cur) continue;
            const t = clamp(p.elapsed / p.duration, 0, 1);
            drawProjectileShape(p.el, p.cur.x, p.cur.y, p.el.size, t, p.angle || 0);
        }
    }

    function launchProjectile(from, to, element, options = {}) {
        const el = getProfile(element);
        projectiles.push({
            from, to, el,
            arc: options.arc ?? el.arc,
            duration: options.duration ?? 750,
            delay: options.delay ?? 0,
            elapsed: 0,
            cur: null,
            angle: 0,
            onHit: options.onHit || null
        });
    }

    // ── Impact effects ────────────────────────────────────────────────────────
    function spawnImpact(x, y, el) {
        impacts.push({ x, y, el, elapsed: 0, duration: 520, style: el.impactStyle });
        // burst particles
        const count = el.impactStyle === 'bolt' ? 16 : (el.impactStyle === 'ripple' ? 10 : 22);
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
            const dist = 18 + Math.random() * 36;
            const life = 280 + Math.random() * 220;
            particles.push({
                x, y,
                vx: Math.cos(angle) * dist * 0.06,
                vy: Math.sin(angle) * dist * 0.06,
                size: el.size * (0.22 + Math.random() * 0.22),
                color: el.impact,
                life, maxLife: life,
                style: el.trailStyle
            });
        }
    }

    function updateImpacts(dt) {
        for (let i = impacts.length - 1; i >= 0; i--) {
            impacts[i].elapsed += dt;
            if (impacts[i].elapsed >= impacts[i].duration) impacts.splice(i, 1);
        }
    }

    function drawImpacts() {
        for (const imp of impacts) {
            const t = imp.elapsed / imp.duration;
            const { x, y, el, style } = imp;
            ctx.save();

            if (style === 'fire') {
                // expanding ring + flash
                const r = t * 55;
                ctx.strokeStyle = rgba(el.color, (1 - t) * 0.8);
                ctx.lineWidth = 5 * (1 - t) + 1;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.stroke();
                const r2 = t * 30;
                ctx.strokeStyle = rgba(el.glow, (1 - t) * 0.5);
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x, y, r2, 0, Math.PI * 2);
                ctx.stroke();
            } else if (style === 'ripple') {
                // three expanding ripple rings
                for (let k = 0; k < 3; k++) {
                    const rt = clamp(t * 1.5 - k * 0.25, 0, 1);
                    const r = rt * 60;
                    ctx.strokeStyle = rgba(el.color, (1 - rt) * 0.7);
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(x, y, r, 0, Math.PI * 2);
                    ctx.stroke();
                }
            } else if (style === 'shatter') {
                // radiating crystal lines
                const count = 8;
                for (let k = 0; k < count; k++) {
                    const angle = (Math.PI * 2 * k) / count;
                    const len = t * (20 + (k % 3) * 15);
                    ctx.strokeStyle = rgba(el.glow, (1 - t) * 0.85);
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(angle) * 4, y + Math.sin(angle) * 4);
                    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
                    ctx.stroke();
                }
                const r = t * 40;
                ctx.strokeStyle = rgba(el.color, (1 - t) * 0.5);
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.stroke();
            } else if (style === 'bolt') {
                // lightning discharge lines
                const count = 6;
                for (let k = 0; k < count; k++) {
                    const angle = (Math.PI * 2 * k) / count;
                    const len = t * (30 + Math.random() * 25);
                    const midX = x + Math.cos(angle + 0.3) * len * 0.5;
                    const midY = y + Math.sin(angle + 0.3) * len * 0.5;
                    ctx.strokeStyle = rgba(k % 2 === 0 ? el.glow : el.color, (1 - t) * 0.9);
                    ctx.lineWidth = k % 2 === 0 ? 3 : 1.5;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.quadraticCurveTo(midX, midY, x + Math.cos(angle) * len, y + Math.sin(angle) * len);
                    ctx.stroke();
                }
            } else if (style === 'void') {
                // implode then explode
                const r = t < 0.4
                    ? lerp(40, 8, t / 0.4)
                    : lerp(8, 55, (t - 0.4) / 0.6);
                const a = t < 0.4 ? (t / 0.4) * 0.6 : ((1 - (t - 0.4) / 0.6) * 0.7);
                ctx.strokeStyle = rgba(el.glow, a);
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.stroke();
            } else if (style === 'wave') {
                // psychic mind-wave: color-shifting rings
                for (let k = 0; k < 3; k++) {
                    const rt = clamp(t * 1.8 - k * 0.3, 0, 1);
                    const r = rt * 52;
                    const col = rgbLerp(el.color, '#ffffff', rt * 0.5);
                    ctx.strokeStyle = rgba(col, (1 - rt) * 0.7);
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    ctx.arc(x, y, r, 0, Math.PI * 2);
                    ctx.stroke();
                }
            } else if (style === 'swirl') {
                // wind spiral
                ctx.strokeStyle = rgba(el.color, (1 - t) * 0.7);
                ctx.lineWidth = 2;
                ctx.beginPath();
                for (let a = 0; a < Math.PI * 4 * t; a += 0.1) {
                    const r = a * 6 * t;
                    const px = x + Math.cos(a) * r;
                    const py = y + Math.sin(a) * r;
                    if (a < 0.1) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.stroke();
            } else if (style === 'decay') {
                // undead: green/purple aura rings
                const r = t * 48;
                ctx.strokeStyle = rgba('#40c060', (1 - t) * 0.6);
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.stroke();
                const r2 = t * 32;
                ctx.strokeStyle = rgba(el.glow, (1 - t) * 0.5);
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, r2, 0, Math.PI * 2);
                ctx.stroke();
            } else if (style === 'ring') {
                // metal shockwave ring
                const r = t * 50;
                ctx.strokeStyle = rgba(el.glow, (1 - t) * 0.9);
                ctx.lineWidth = 4 * (1 - t) + 1;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.stroke();
            } else if (style === 'chunk') {
                // earth: ring + debris
                const r = t * 42;
                ctx.strokeStyle = rgba(el.glow, (1 - t) * 0.7);
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                // generic burst
                const r = t * 44;
                ctx.strokeStyle = rgba(el.color, (1 - t) * 0.75);
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    // ── Floating text / damage numbers ────────────────────────────────────────
    function updateFloaters(dt) {
        for (let i = floaters.length - 1; i >= 0; i--) {
            const f = floaters[i];
            f.elapsed += dt;
            f.y -= dt * 0.045;
            if (f.elapsed >= f.duration) floaters.splice(i, 1);
        }
    }

    function drawFloaters() {
        for (const f of floaters) {
            const t = clamp(f.elapsed / f.duration, 0, 1);
            const a = t < 0.15 ? t / 0.15 : 1 - ((t - 0.15) / 0.85);
            ctx.save();
            ctx.globalAlpha = clamp(a, 0, 1);
            ctx.font = `${f.bold ? '900' : '700'} ${f.size}px 'Segoe UI', sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = 'rgba(0,0,0,0.7)';
            ctx.lineWidth = 4;
            ctx.strokeText(f.text, f.x, f.y);
            ctx.fillStyle = f.color;
            ctx.fillText(f.text, f.x, f.y);
            ctx.restore();
        }
    }

    // ── Camera shake ──────────────────────────────────────────────────────────
    function cameraShake(intensity = 8, durationMs = 240) {
        tween(durationMs, (t) => {
            const damp = 1 - t;
            shakeX = (Math.random() * 2 - 1) * intensity * damp;
            shakeY = (Math.random() * 2 - 1) * intensity * damp;
        }, () => { shakeX = 0; shakeY = 0; });
    }

    // ── Phase flash ───────────────────────────────────────────────────────────
    function phaseFlash(label, element) {
        const el = element ? getProfile(element) : { color: '#e2b714', glow: '#ffe080' };
        floaters.push({
            text: `${label} PHASE`,
            x: canvas.width / 2,
            y: canvas.height * 0.22,
            color: el.glow || '#ffe080',
            size: 46, bold: true,
            elapsed: 0, duration: 1400
        });
        // screen flash overlay
        tween(500, (t) => {
            ctx.save();
            ctx.fillStyle = rgba(el.color, (1 - t) * 0.12);
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
        });
    }

    // ── DOM cell coordinate resolution ────────────────────────────────────────
    function getCellCenter(isPlayer, row, col) {
        const gridId = isPlayer ? 'playerGrid' : 'enemyGrid';
        const grid = document.getElementById(gridId);
        if (!grid) return null;
        const cell = grid.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        if (!cell) return null;
        const r = cell.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    function getHandOrigin() {
        const hand = document.getElementById('playerHand');
        if (!hand) return { x: canvas.width * 0.5, y: canvas.height * 0.88 };
        const r = hand.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height * 0.3 };
    }

    // ── Board state diff — auto-detect attacks ────────────────────────────────
    function boardCellKey(cell) {
        if (!cell) return null;
        return `${cell.instanceId || cell.id || cell.name}:${cell.hp ?? 0}`;
    }

    function normalizeElement(element) {
        const value = String(element || '').trim().toUpperCase();
        return value || null;
    }

    function diffBoards(prev, next) {
        const damaged = [];
        if (!prev || !next) return damaged;
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const p = prev[r]?.[c];
                const n = next[r]?.[c];
                if (!p || !n) continue;
                const prevHp = p.hp ?? 0;
                const nextHp = n.hp ?? 0;
                const sameCard = (p.instanceId && n.instanceId && p.instanceId === n.instanceId)
                    || (p.id && n.id && p.id === n.id)
                    || (String(p.name || '') === String(n.name || '') && p.name);
                if (sameCard && nextHp < prevHp) {
                    damaged.push({
                        row: r,
                        col: c,
                        amount: prevHp - nextHp,
                        element: normalizeElement(n.element || p.element),
                        name: n.name || p.name || '',
                        instanceId: n.instanceId || p.instanceId || n.id || p.id || ''
                    });
                }
            }
        }
        return damaged;
    }

    // Stagger delays for multi-target
    const STAGGER_SINGLE = 0;
    const STAGGER_ROW = 110;
    const STAGGER_ALL = 80;

    function classifyTargets(targets) {
        if (targets.length === 1) return 'single';
        const firstRow = targets[0].row;
        return targets.every(t => t.row === firstRow) ? 'row' : 'all';
    }

    function fireAttackFx(fromIsPlayer, sourceRow, sourceCol, targets, element) {
        const from = getCellCenter(fromIsPlayer, sourceRow, sourceCol)
                  || { x: canvas.width * (fromIsPlayer ? 0.5 : 0.5),
                       y: canvas.height * (fromIsPlayer ? 0.75 : 0.25) };
        const pattern = classifyTargets(targets);
        const stagger = pattern === 'single' ? STAGGER_SINGLE : (pattern === 'row' ? STAGGER_ROW : STAGGER_ALL);
        const sorted = [...targets].sort((a, b) => a.col - b.col);

        sorted.forEach((target, i) => {
            const to = getCellCenter(target.isPlayer ?? !fromIsPlayer, target.row, target.col);
            if (!to) return;
            const delay = i * stagger;
            const projectileMs = pattern === 'single' ? 750 : (pattern === 'row' ? 680 : 600);

            launchProjectile(from, to, element, {
                duration: projectileMs,
                delay,
                onHit: (hx, hy) => {
                    if (target.amount) {
                        floaters.push({
                            text: `-${target.amount}`,
                            x: hx,
                            y: hy - 10,
                            color: getProfile(element).glow,
                            size: 28, bold: true,
                            elapsed: 0, duration: 1100
                        });
                    }
                    cameraShake(targets.length > 1 ? 5 : 9, 200);
                }
            });
        });
    }

    // ── Board update handler ──────────────────────────────────────────────────
    let _prevPlayer = null;
    let _prevEnemy = null;

    function makeCellRef(board, row, col, fallbackElement = null) {
        const cell = board?.[row]?.[col];
        return {
            row,
            col,
            cell,
            element: normalizeElement(fallbackElement || cell?.element)
        };
    }

    function findBoardCell(board, predicate) {
        if (!board) return null;
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const cell = board[r]?.[c];
                if (cell && predicate(cell, r, c)) {
                    return makeCellRef(board, r, c);
                }
            }
        }
        return null;
    }

    function findFirstOccupiedCell(board) {
        return findBoardCell(board, () => true);
    }

    function namesMatch(a, b) {
        return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    }

    function findCellByName(board, name) {
        if (!name) return null;
        return findBoardCell(board, cell => namesMatch(cell.name, name));
    }

    function findCellByInstanceId(board, instanceId) {
        if (!instanceId) return null;
        return findBoardCell(board, cell => String(cell.instanceId || cell.id || '') === String(instanceId));
    }

    function findPendingAttacker(board, pending) {
        if (!pending) return null;
        const byId = findCellByInstanceId(board, pending.instanceId);
        if (byId) return makeCellRef(board, byId.row, byId.col, pending.element || byId.element);
        if (pending.row != null && pending.col != null) {
            const row = Number(pending.row);
            const col = Number(pending.col);
            if (Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < 3 && col >= 0 && col < 3) {
                return makeCellRef(board, row, col, pending.element);
            }
        }
        const byName = findCellByName(board, pending.name);
        return byName ? makeCellRef(board, byName.row, byName.col, pending.element || byName.element) : null;
    }

    function logCounts(logs) {
        const counts = new Map();
        (logs || []).forEach(line => {
            const key = String(line || '');
            counts.set(key, (counts.get(key) || 0) + 1);
        });
        return counts;
    }

    function getNewLogEntries(prevState, nextState) {
        const prevCounts = logCounts(prevState?.gameLog);
        const newEntries = [];
        (nextState?.gameLog || []).forEach(line => {
            const key = String(line || '');
            const count = prevCounts.get(key) || 0;
            if (count > 0) {
                prevCounts.set(key, count - 1);
            } else {
                newEntries.push(key);
            }
        });
        return newEntries;
    }

    function normalizeLogToken(value) {
        return String(value || '').trim().replace(/[.!]+$/g, '').toLowerCase();
    }

    function findUserOfAbility(logs, abilityName) {
        const wanted = normalizeLogToken(abilityName);
        if (!wanted) return null;
        for (const line of logs) {
            const match = String(line || '').match(/^(.+?) uses (.+?)\.?$/i);
            if (match && normalizeLogToken(match[2]) === wanted) {
                return match[1].trim();
            }
        }
        return null;
    }

    function findCellFromAbilityName(board, abilityName) {
        const ability = String(abilityName || '').trim().toLowerCase();
        if (!ability) return null;
        const matches = [];
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const cell = board?.[r]?.[c];
                const name = String(cell?.name || '').trim().toLowerCase();
                if (name && (ability === name || ability.startsWith(`${name} `) || ability.includes(name))) {
                    matches.push(makeCellRef(board, r, c));
                }
            }
        }
        matches.sort((a, b) => String(b.cell?.name || '').length - String(a.cell?.name || '').length);
        return matches[0] || null;
    }

    function findAttackerFromLogs(board, damagedCell, logs) {
        const targetName = String(damagedCell?.name || '').trim().toLowerCase();
        for (const line of logs) {
            const text = String(line || '');
            const lower = text.toLowerCase();
            if (!lower.includes(' deals ') || !lower.includes(' damage to ')) continue;
            if (targetName && !lower.includes(` damage to ${targetName}`) && !lower.includes(` to ${targetName}`)) continue;

            const abilityName = text.slice(0, lower.indexOf(' deals ')).trim();
            const sourceName = findUserOfAbility(logs, abilityName);
            const byUser = findCellByName(board, sourceName);
            if (byUser) return byUser;

            const byAbility = findCellFromAbilityName(board, abilityName);
            if (byAbility) return byAbility;
        }
        return null;
    }

    function resolveAttackSource(board, damagedCell, logs, sourceHint = null) {
        return sourceHint
            || findAttackerFromLogs(board, damagedCell, logs)
            || findFirstOccupiedCell(board);
    }

    function launchDamageProjectiles({
        sourceBoard,
        sourceIsPlayer,
        targetIsPlayer,
        damagedCells,
        logs,
        sourceHint,
        fallbackOrigin,
        floaterSize,
        shakeIntensity
    }) {
        const pattern = classifyTargets(damagedCells);
        const stagger = pattern === 'single' ? 0 : STAGGER_ROW;
        damagedCells.sort((a, b) => a.col - b.col).forEach((t, i) => {
            const source = resolveAttackSource(sourceBoard, t, logs, sourceHint);
            const from = source
                ? getCellCenter(sourceIsPlayer, source.row, source.col)
                : null;
            const to = getCellCenter(targetIsPlayer, t.row, t.col);
            const element = source?.element || t.element || 'NEUTRAL';
            if (!to) return;
            launchProjectile(from || fallbackOrigin, to, element, {
                duration: 700,
                delay: i * stagger,
                onHit: (hx, hy) => {
                    floaters.push({
                        text: `-${t.amount}`,
                        x: hx,
                        y: hy - 10,
                        color: getProfile(element).glow,
                        size: floaterSize,
                        bold: true,
                        elapsed: 0,
                        duration: 1100
                    });
                    cameraShake(shakeIntensity, 200);
                }
            });
        });
    }

    function onBoardUpdate(prevState, nextState) {
        if (!prevState || !nextState) { _prevPlayer = null; _prevEnemy = null; return; }

        const prevPlayer = prevState.playerBoard || prevState.player?.board;
        const prevEnemy  = prevState.enemyBoard  || prevState.enemy?.board;
        const nextPlayer = nextState.playerBoard || nextState.player?.board;
        const nextEnemy  = nextState.enemyBoard  || nextState.enemy?.board;

        const playerDamaged = diffBoards(prevPlayer, nextPlayer);
        const enemyDamaged  = diffBoards(prevEnemy,  nextEnemy);
        const newLogs = getNewLogEntries(prevState, nextState);

        // enemy attacks dealt damage to player cells; use the sender's element, not the target's.
        if (playerDamaged.length > 0) {
            launchDamageProjectiles({
                sourceBoard: prevEnemy,
                sourceIsPlayer: false,
                targetIsPlayer: true,
                damagedCells: playerDamaged,
                logs: newLogs,
                sourceHint: null,
                fallbackOrigin: { x: canvas.width * 0.5, y: canvas.height * 0.15 },
                floaterSize: 28,
                shakeIntensity: 8
            });
        }

        // player attacks dealt damage to enemy cells; pendingBattle tells us the active sender.
        if (enemyDamaged.length > 0) {
            launchDamageProjectiles({
                sourceBoard: prevPlayer,
                sourceIsPlayer: true,
                targetIsPlayer: false,
                damagedCells: enemyDamaged,
                logs: newLogs,
                sourceHint: findPendingAttacker(prevPlayer, prevState.pendingBattle),
                fallbackOrigin: { x: canvas.width * 0.5, y: canvas.height * 0.82 },
                floaterSize: 24,
                shakeIntensity: 6
            });
        }
    }

    // ── Public API ────────────────────────────────────────────────────────────
    window.SieglingsFx = {
        // Fire from one board cell to another
        attackCell(fromIsPlayer, fr, fc, toIsPlayer, tr, tc, element, options = {}) {
            const from = getCellCenter(fromIsPlayer, fr, fc);
            const to   = getCellCenter(toIsPlayer,   tr, tc);
            if (!from || !to) return;
            launchProjectile(from, to, element, options);
        },

        // Fire from one board cell to multiple targets
        // targets: [{ isPlayer, row, col, amount? }, ...]
        attackCells(fromIsPlayer, fr, fc, targets, element) {
            fireAttackFx(fromIsPlayer, fr, fc, targets, element);
        },

        // Spawn impact burst at a cell
        impactAt(isPlayer, row, col, element) {
            const pos = getCellCenter(isPlayer, row, col);
            if (!pos) return;
            spawnImpact(pos.x, pos.y, getProfile(element));
        },

        // Fire from a board cell to an arbitrary screen point — used for
        // direct attacks on the enemy/player health bar in the HUD.
        attackPoint(fromIsPlayer, fr, fc, toX, toY, element, options = {}) {
            const from = getCellCenter(fromIsPlayer, fr, fc);
            if (!from) return;
            launchProjectile(from, { x: toX, y: toY }, element, options);
        },

        // Spawn an impact burst at an arbitrary screen point.
        impactAtPoint(x, y, element) {
            spawnImpact(x, y, getProfile(element));
        },

        // Floating damage number at a cell
        floatingDamage(isPlayer, row, col, amount, element) {
            const pos = getCellCenter(isPlayer, row, col);
            if (!pos) return;
            const el = getProfile(element);
            floaters.push({ text: `-${amount}`, x: pos.x, y: pos.y - 14, color: el.glow, size: 28, bold: true, elapsed: 0, duration: 1100 });
        },

        // Floating text at arbitrary screen position
        floatingText(x, y, text, color = '#ffffff', size = 22) {
            floaters.push({ text, x, y, color, size, bold: false, elapsed: 0, duration: 900 });
        },

        cameraShake,
        phaseFlash,

        // Called by game.js after each state-changing API response
        onBoardUpdate,

        _debugSnapshot() {
            return {
                projectiles: projectiles.map(p => ({
                    color: p.el?.color,
                    trailStyle: p.el?.trailStyle,
                    impactStyle: p.el?.impactStyle,
                    from: p.from,
                    to: p.to
                }))
            };
        },
    };
})();
