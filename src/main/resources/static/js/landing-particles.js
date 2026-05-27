/**
 * Landing hero — element particles drift around the SIEGELINGS wordmark.
 * Full-hero layer (no logo box); slow, fluttery motion.
 */
(function () {
    'use strict';

    const SPEED = 0.34;
    const ELEMENT_KEYS = ['fire', 'ice', 'wind', 'earth'];
    const CSS_VARS = [
        '--element-fire',
        '--element-ice',
        '--element-wind',
        '--element-earth'
    ];
    const GLOW_VARS = [
        '--element-fire-glow',
        '--element-ice-glow',
        '--element-wind-glow',
        '--element-earth-glow'
    ];

    const FALLBACK_COLORS = [
        { key: 'fire',  base: { r: 255, g: 69, b: 0 },   glow: { r: 255, g: 140, b: 40 } },
        { key: 'ice',   base: { r: 0, g: 207, b: 255 },  glow: { r: 120, g: 235, b: 255 } },
        { key: 'wind',  base: { r: 110, g: 231, b: 183 }, glow: { r: 180, g: 255, b: 220 } },
        { key: 'earth', base: { r: 139, g: 94, b: 60 },  glow: { r: 185, g: 140, b: 90 } }
    ];

    function parseCssColor(raw) {
        const value = String(raw || '').trim();
        if (!value) return null;
        const probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;left:-9999px;visibility:hidden;';
        probe.style.color = value;
        document.body.appendChild(probe);
        let resolved = getComputedStyle(probe).color;
        if (!resolved || resolved === 'rgba(0, 0, 0, 0)') {
            probe.style.color = '';
            probe.style.backgroundColor = value;
            resolved = getComputedStyle(probe).backgroundColor;
        }
        probe.remove();
        const m = resolved && resolved.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m) return null;
        return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), css: resolved };
    }

    function resolveThemeColor(varName) {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return parseCssColor(raw);
    }

    function rgba(c, a) {
        return `rgba(${c.r},${c.g},${c.b},${a})`;
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function rand(min, max) {
        return min + Math.random() * (max - min);
    }

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    class LandingParticleField {
        constructor(hero) {
            this.hero = hero;
            this.wordmark = hero.querySelector('.siegelings-wordmark');

            this.canvas = document.createElement('canvas');
            this.canvas.className = 'hero-particle-canvas';
            this.canvas.setAttribute('aria-hidden', 'true');
            this.domLayer = document.createElement('div');
            this.domLayer.className = 'hero-particle-dom';
            this.domLayer.setAttribute('aria-hidden', 'true');

            hero.insertBefore(this.canvas, hero.firstChild);
            hero.insertBefore(this.domLayer, this.canvas.nextSibling);

            this.ctx = this.canvas.getContext('2d');
            this.canvasOk = Boolean(this.ctx);
            this.palette = [];
            this.particles = [];
            this.auras = [];
            this.highlightIndex = -1;
            this.intensity = 0;
            this.targetIntensity = 0;
            this.running = false;
            this.lastTs = 0;
            this.center = { x: 0, y: 0 };
            this.orbitRadius = 200;
            this.motionScale = SPEED * (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.55 : 1);

            this._onResize = () => this.resize();
            window.addEventListener('resize', this._onResize);
            this.resize();
            this.resolvePalette();
        }

        resize() {
            if (!this.wordmark) {
                this.wordmark = this.hero.querySelector('.siegelings-wordmark');
            }
            if (!this.wordmark) return;

            const heroRect = this.hero.getBoundingClientRect();
            const wordRect = this.wordmark.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);

            this.width = Math.max(1, heroRect.width);
            this.height = Math.max(1, heroRect.height);
            if (this.canvasOk) {
                this.canvas.width = Math.round(this.width * dpr);
                this.canvas.height = Math.round(this.height * dpr);
                this.canvas.style.width = `${this.width}px`;
                this.canvas.style.height = `${this.height}px`;
                this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }

            this.center.x = (wordRect.left - heroRect.left) + wordRect.width * 0.5;
            this.center.y = (wordRect.top - heroRect.top) + wordRect.height * 0.5;
            this.orbitRadius = Math.max(
                wordRect.width * 0.72,
                wordRect.height * 0.55,
                Math.min(this.width, this.height) * 0.22,
                100
            );

            const orbitX = `${this.center.x}px`;
            const orbitY = `${this.center.y}px`;
            this.domLayer.style.setProperty('--orbit-cx', orbitX);
            this.domLayer.style.setProperty('--orbit-cy', orbitY);
        }

        resolvePalette() {
            this.palette = ELEMENT_KEYS.map((key, index) => {
                const fb = FALLBACK_COLORS[index];
                const base = resolveThemeColor(CSS_VARS[index]) || fb.base;
                const glow = resolveThemeColor(GLOW_VARS[index]) || fb.glow;
                return { key, base, glow };
            });
        }

        setHighlight(cssVarOrIndex) {
            let index = -1;
            if (typeof cssVarOrIndex === 'number') {
                index = cssVarOrIndex;
            } else {
                const needle = String(cssVarOrIndex || '').trim();
                index = CSS_VARS.findIndex((v) => needle === `var(${v})` || needle.includes(v.slice(2)));
            }
            if (index === this.highlightIndex && this.targetIntensity >= 0.98) {
                return;
            }
            this.highlightIndex = index;
            if (index < 0) {
                this.targetIntensity = 0;
                this.fadeOut();
                return;
            }
            this.resize();
            this.rebuildSwarm(index);
            this.syncDomOrbs(index);
            this.targetIntensity = 1;
            this.hero.classList.add('hero-particles-active');
            this.ensureLoop();
        }

        clearHighlight() {
            this.targetIntensity = 0;
            this.highlightIndex = -1;
            window.setTimeout(() => {
                if (this.targetIntensity === 0) {
                    this.hero.classList.remove('hero-particles-active');
                    this.domLayer.innerHTML = '';
                }
            }, 650);
        }

        fadeOut() {
            this.targetIntensity = 0;
            this.highlightIndex = -1;
            this.hero.classList.remove('hero-particles-active');
            this.domLayer.innerHTML = '';
        }

        syncDomOrbs(activeIndex) {
            const inactive = this.palette
                .map((el, i) => ({ el, i }))
                .filter(({ i }) => i !== activeIndex);

            const parts = [];
            inactive.forEach(({ el }, swarmIndex) => {
                for (let o = 0; o < 3; o += 1) {
                    const delay = (swarmIndex * 2.8 + o * 1.4).toFixed(2);
                    const orbitPx = Math.round(this.orbitRadius * (0.85 + o * 0.12 + swarmIndex * 0.05));
                    const size = Math.round(44 + o * 12 + swarmIndex * 5);
                    parts.push(
                        `<span class="hero-particle-orb hero-particle-orb-${el.key}" ` +
                        `style="--orb-delay:${delay}s;--orb-orbit:${orbitPx}px;--orb-size:${size}px"></span>`
                    );
                }
                for (let s = 0; s < 6; s += 1) {
                    const delay = (swarmIndex * 3.2 + s * 0.55).toFixed(2);
                    const orbitPx = Math.round(this.orbitRadius * (0.65 + s * 0.09 + swarmIndex * 0.04));
                    parts.push(
                        `<span class="hero-particle-spark hero-particle-spark-${el.key}" ` +
                        `style="--orb-delay:${delay}s;--orb-orbit:${orbitPx}px"></span>`
                    );
                }
            });
            this.domLayer.innerHTML = parts.join('');
        }

        rebuildSwarm(activeIndex) {
            this.particles = [];
            this.auras = [];
            const scale = this.motionScale;
            const inactive = this.palette
                .map((el, i) => ({ el, i }))
                .filter(({ i }) => i !== activeIndex);

            inactive.forEach(({ el }, swarmIndex) => {
                const count = Math.max(10, Math.round((16 + rand(0, 8)) * scale));
                const auraCount = 2;
                const bandOffset = (swarmIndex - (inactive.length - 1) * 0.5) * 0.38;

                for (let a = 0; a < auraCount; a += 1) {
                    this.auras.push(this.createAura(el, bandOffset, a));
                }
                for (let p = 0; p < count; p += 1) {
                    this.particles.push(this.createParticle(el, bandOffset, p / count));
                }
            });
        }

        createAura(el, bandOffset, auraIndex) {
            return {
                kind: 'aura',
                el,
                angle: auraIndex * Math.PI + rand(0, Math.PI * 2),
                angleVel: rand(0.00008, 0.00018) * (Math.random() > 0.5 ? 1 : -1),
                radius: this.orbitRadius * rand(0.55, 1.02),
                radiusVel: rand(-0.004, 0.004),
                wobbleX: rand(0.25, 0.55),
                wobbleY: rand(0.25, 0.55),
                wobblePhase: rand(0, Math.PI * 2),
                flutterPhase: rand(0, Math.PI * 2),
                size: rand(70, 120),
                alpha: rand(0.12, 0.22),
                bandOffset,
                drift: rand(0, 1000)
            };
        }

        createParticle(el, bandOffset, along) {
            return {
                kind: 'spark',
                el,
                angle: along * Math.PI * 2 + bandOffset + rand(-0.15, 0.15),
                angleVel: rand(0.00012, 0.00028) * (Math.random() > 0.5 ? 1 : -1),
                radius: this.orbitRadius * rand(0.4, 1.08),
                radiusVel: rand(-0.008, 0.008),
                wobbleX: rand(0.35, 0.75),
                wobbleY: rand(0.35, 0.75),
                wobblePhase: rand(0, Math.PI * 2),
                flutterPhase: rand(0, Math.PI * 2),
                size: rand(2, 4.5),
                shine: Math.random() > 0.5,
                alpha: rand(0.5, 0.82),
                bandOffset,
                trail: [],
                drift: rand(0, 1000)
            };
        }

        ensureLoop() {
            if (this.running) return;
            this.running = true;
            this.lastTs = performance.now();
            requestAnimationFrame((ts) => this.tick(ts));
        }

        tick(ts) {
            const dt = Math.min(ts - this.lastTs, 48);
            this.lastTs = ts;

            this.intensity = lerp(this.intensity, this.targetIntensity, 0.08);
            const opacity = String(Math.max(0, Math.min(1, this.intensity)));
            this.canvas.style.opacity = opacity;
            this.domLayer.style.opacity = opacity;

            const alive = this.intensity > 0.01 || this.targetIntensity > 0.01;

            if (alive && this.canvasOk) {
                this.update(dt, ts);
                this.draw(ts);
            } else if (this.canvasOk) {
                this.ctx.clearRect(0, 0, this.width, this.height);
            }

            if (alive) {
                requestAnimationFrame((t) => this.tick(t));
            } else {
                this.running = false;
                this.particles = [];
                this.auras = [];
            }
        }

        update(dt, ts) {
            const t = ts * 0.001;
            const cx = this.center.x;
            const cy = this.center.y;

            const step = (item) => {
                item.flutterPhase += dt * 0.00035;
                const flutter = Math.sin(item.flutterPhase + item.wobblePhase) * 0.00045 * dt;
                item.angle += (item.angleVel + flutter) * dt;

                item.radius += item.radiusVel * dt;
                const minR = this.orbitRadius * 0.35;
                const maxR = this.orbitRadius * 1.15;
                if (item.radius < minR || item.radius > maxR) {
                    item.radiusVel *= -0.6;
                    item.radius = clamp(item.radius, minR, maxR);
                }

                const wobT = t * 0.32 + item.drift * 0.0004;
                const wobbleAmp = item.kind === 'aura' ? 18 : 10;
                const ox = Math.sin(wobT * item.wobbleX + item.wobblePhase) * wobbleAmp;
                const oy = Math.cos(wobT * item.wobbleY + item.wobblePhase * 1.2) * wobbleAmp * 0.85;
                item.x = cx + Math.cos(item.angle) * item.radius + ox;
                item.y = cy + Math.sin(item.angle) * item.radius * 0.88 + oy;

                if (item.kind === 'spark') {
                    item.trail.push({ x: item.x, y: item.y, life: 1 });
                    if (item.trail.length > 4) item.trail.shift();
                    item.trail.forEach((pt) => { pt.life -= 0.08 * (dt / 16); });
                    item.trail = item.trail.filter((pt) => pt.life > 0.06);
                }
            };

            this.auras.forEach(step);
            this.particles.forEach(step);
        }

        draw(ts) {
            const ctx = this.ctx;
            const fade = this.intensity;
            ctx.clearRect(0, 0, this.width, this.height);
            ctx.globalCompositeOperation = 'lighter';

            this.auras.forEach((a) => this.drawAura(ctx, a, fade));
            this.particles.forEach((p) => this.drawSpark(ctx, p, fade, ts));

            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
        }

        drawAura(ctx, a, fade) {
            const { base, glow } = a.el;
            const grd = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, a.size);
            grd.addColorStop(0, rgba(glow, a.alpha * fade * 0.9));
            grd.addColorStop(0.45, rgba(base, a.alpha * fade * 0.45));
            grd.addColorStop(1, rgba(base, 0));
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.ellipse(a.x, a.y, a.size, a.size * 0.75, a.angle * 0.08, 0, Math.PI * 2);
            ctx.fill();
        }

        drawSpark(ctx, p, fade, ts) {
            const { base, glow } = p.el;
            p.trail.forEach((pt, i) => {
                const a = pt.life * p.alpha * fade * 0.28 * (i / Math.max(1, p.trail.length));
                ctx.fillStyle = rgba(base, a);
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, p.size * 0.55, 0, Math.PI * 2);
                ctx.fill();
            });

            const pulse = 0.92 + Math.sin(ts * 0.003 + p.drift) * 0.08;
            const r = p.size * pulse;

            const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4.5);
            halo.addColorStop(0, rgba(glow, p.alpha * fade * 0.5));
            halo.addColorStop(0.55, rgba(base, p.alpha * fade * 0.18));
            halo.addColorStop(1, rgba(base, 0));
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r * 4.5, 0, Math.PI * 2);
            ctx.fill();

            const core = ctx.createRadialGradient(p.x - r * 0.2, p.y - r * 0.2, 0, p.x, p.y, r * 1.2);
            core.addColorStop(0, rgba({ r: 255, g: 255, b: 255 }, p.shine ? 0.75 * fade : 0.4 * fade));
            core.addColorStop(0.5, rgba(glow, p.alpha * fade * 0.65));
            core.addColorStop(1, rgba(base, 0));
            ctx.fillStyle = core;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r * 1.2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    let field = null;

    function init() {
        const hero = document.getElementById('hero');
        if (!hero || field) return;
        field = new LandingParticleField(hero);
    }

    window.LandingParticles = {
        setHighlight(cssVarOrIndex) {
            if (!field) init();
            field?.setHighlight(cssVarOrIndex);
        },
        clearHighlight(delayMs) {
            field?.clearHighlight(delayMs);
        },
        rebuildPalette() {
            field?.resolvePalette();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
