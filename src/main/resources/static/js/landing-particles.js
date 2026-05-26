/**
 * Landing hero — dispersed element particle auras.
 * When one element color is highlighted on the wordmark, the other palette
 * colors swarm as fluid, shiny particles orbiting the hero with soft blotch auras.
 */
(function () {
    'use strict';

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
        return {
            r: Number(m[1]),
            g: Number(m[2]),
            b: Number(m[3]),
            css: resolved
        };
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

    class LandingParticleField {
        constructor(hero) {
            this.hero = hero;
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'hero-particle-canvas';
            this.canvas.setAttribute('aria-hidden', 'true');
            hero.appendChild(this.canvas);
            this.ctx = this.canvas.getContext('2d');
            this.palette = [];
            this.particles = [];
            this.auras = [];
            this.highlightIndex = -1;
            this.intensity = 0;
            this.targetIntensity = 0;
            this.running = false;
            this.lastTs = 0;
            this.center = { x: 0, y: 0 };
            this.orbitRadius = 280;
            this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            this._onResize = () => this.resize();
            window.addEventListener('resize', this._onResize);
            this.resize();
            this.resolvePalette();
        }

        destroy() {
            window.removeEventListener('resize', this._onResize);
            this.canvas.remove();
            this.running = false;
        }

        resize() {
            const rect = this.hero.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            this.width = Math.max(1, rect.width);
            this.height = Math.max(1, rect.height);
            this.canvas.width = Math.round(this.width * dpr);
            this.canvas.height = Math.round(this.height * dpr);
            this.canvas.style.width = `${this.width}px`;
            this.canvas.style.height = `${this.height}px`;
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            this.center.x = this.width * 0.5;
            this.center.y = this.height * 0.46;
            this.orbitRadius = Math.min(this.width, this.height) * 0.52;
        }

        resolvePalette() {
            this.palette = ELEMENT_KEYS.map((key, index) => {
                const base = resolveThemeColor(CSS_VARS[index]);
                const glow = resolveThemeColor(GLOW_VARS[index]) || base;
                return { key, base, glow };
            }).filter((entry) => entry.base);
        }

        setHighlight(cssVarOrIndex) {
            let index = -1;
            if (typeof cssVarOrIndex === 'number') {
                index = cssVarOrIndex;
            } else {
                const needle = String(cssVarOrIndex || '').trim();
                index = CSS_VARS.findIndex((v) => needle === `var(${v})` || needle.includes(v.slice(2)));
            }
            if (index === this.highlightIndex && this.targetIntensity >= 1) return;
            this.highlightIndex = index;
            if (index < 0) {
                this.targetIntensity = 0;
                this.fadeOut();
                return;
            }
            this.resize();
            this.rebuildSwarm(index);
            this.targetIntensity = 1;
            this.hero.classList.add('hero-particles-active');
            this.canvas.style.opacity = '1';
            this.ensureLoop();
        }

        clearHighlight(delayMs = 650) {
            this.targetIntensity = 0;
            this.highlightIndex = -1;
            window.setTimeout(() => {
                if (this.targetIntensity === 0) {
                    this.hero.classList.remove('hero-particles-active');
                }
            }, delayMs);
        }

        fadeOut() {
            this.targetIntensity = 0;
            this.highlightIndex = -1;
            this.hero.classList.remove('hero-particles-active');
        }

        rebuildSwarm(activeIndex) {
            this.particles = [];
            this.auras = [];
            if (this.reducedMotion) return;

            const inactive = this.palette
                .map((el, i) => ({ el, i }))
                .filter(({ i }) => i !== activeIndex);

            inactive.forEach(({ el, i }, swarmIndex) => {
                const count = 42 + Math.floor(rand(0, 18));
                const auraCount = 4 + (swarmIndex % 2);
                const bandOffset = (swarmIndex - (inactive.length - 1) * 0.5) * 0.38;

                for (let a = 0; a < auraCount; a += 1) {
                    this.auras.push(this.createAura(el, bandOffset, a, auraCount));
                }
                for (let p = 0; p < count; p += 1) {
                    this.particles.push(this.createParticle(el, bandOffset, p / count));
                }
            });
        }

        createAura(el, bandOffset, auraIndex, auraCount) {
            const phase = (auraIndex / Math.max(1, auraCount)) * Math.PI * 2;
            return {
                kind: 'aura',
                el,
                angle: phase + rand(0, Math.PI * 2),
                angleVel: rand(0.00022, 0.00048) * (Math.random() > 0.5 ? 1 : -1),
                radius: this.orbitRadius * rand(0.55, 0.95),
                radiusVel: rand(-0.018, 0.018),
                wobbleX: rand(0.4, 1.1),
                wobbleY: rand(0.4, 1.1),
                wobblePhase: rand(0, Math.PI * 2),
                size: rand(90, 168),
                alpha: rand(0.14, 0.28),
                bandOffset,
                drift: rand(0, 1000)
            };
        }

        createParticle(el, bandOffset, along) {
            return {
                kind: 'spark',
                el,
                angle: along * Math.PI * 2 + bandOffset + rand(-0.25, 0.25),
                angleVel: rand(0.00055, 0.00135) * (Math.random() > 0.5 ? 1 : -1),
                radius: this.orbitRadius * rand(0.32, 1.02),
                radiusVel: rand(-0.04, 0.04),
                wobbleX: rand(0.8, 2.4),
                wobbleY: rand(0.8, 2.4),
                wobblePhase: rand(0, Math.PI * 2),
                size: rand(2.4, 6.8),
                shine: Math.random() > 0.4,
                alpha: rand(0.62, 1),
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

            this.intensity = lerp(this.intensity, this.targetIntensity, this.reducedMotion ? 1 : 0.12);
            this.canvas.style.opacity = String(Math.max(0, Math.min(1, this.intensity)));
            const alive = this.intensity > 0.01 || this.targetIntensity > 0.01;

            if (alive && !this.reducedMotion) {
                this.update(dt, ts);
                this.draw(ts);
            } else {
                this.ctx.clearRect(0, 0, this.width, this.height);
            }

            if (alive) {
                requestAnimationFrame((t) => this.tick(t));
            } else {
                this.running = false;
                this.particles = [];
                this.auras = [];
                this.canvas.style.opacity = '0';
            }
        }

        update(dt, ts) {
            const t = ts * 0.001;
            const cx = this.center.x;
            const cy = this.center.y;
            const pull = 0.000035 * dt;

            const step = (item) => {
                item.angle += item.angleVel * dt;
                item.radius += item.radiusVel * dt;
                const minR = this.orbitRadius * 0.22;
                const maxR = this.orbitRadius * 1.08;
                if (item.radius < minR || item.radius > maxR) {
                    item.radiusVel *= -1;
                    item.radius = clamp(item.radius, minR, maxR);
                }
                const wobT = t * 0.9 + item.drift * 0.001;
                const ox = Math.sin(wobT * item.wobbleX + item.wobblePhase) * (item.kind === 'aura' ? 34 : 18);
                const oy = Math.cos(wobT * item.wobbleY + item.wobblePhase * 1.3) * (item.kind === 'aura' ? 28 : 14);
                item.x = cx + Math.cos(item.angle) * item.radius + ox;
                item.y = cy + Math.sin(item.angle) * item.radius * 0.82 + oy;

                if (item.kind === 'spark') {
                    item.trail.push({ x: item.x, y: item.y, life: 1 });
                    if (item.trail.length > 6) item.trail.shift();
                    item.trail.forEach((pt) => { pt.life -= 0.14 * (dt / 16); });
                    item.trail = item.trail.filter((pt) => pt.life > 0.04);
                }
            };

            this.auras.forEach(step);
            this.particles.forEach(step);

            // gentle mutual orbit bias per band
            this.particles.forEach((p) => {
                p.angleVel += Math.sin(t + p.bandOffset * 4) * pull;
            });
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
            grd.addColorStop(0, rgba(glow, a.alpha * fade * 1.15));
            grd.addColorStop(0.35, rgba(base, a.alpha * fade * 0.75));
            grd.addColorStop(0.72, rgba(base, a.alpha * fade * 0.22));
            grd.addColorStop(1, rgba(base, 0));
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.ellipse(a.x, a.y, a.size, a.size * 0.72, a.angle * 0.15, 0, Math.PI * 2);
            ctx.fill();

            // water-blotch caustic ring
            ctx.strokeStyle = rgba(glow, a.alpha * fade * 0.35);
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.ellipse(a.x, a.y, a.size * 0.62, a.size * 0.4, -a.angle * 0.2, 0, Math.PI * 2);
            ctx.stroke();
        }

        drawSpark(ctx, p, fade, ts) {
            const { base, glow } = p.el;
            p.trail.forEach((pt, i) => {
                const a = pt.life * p.alpha * fade * 0.35 * (i / Math.max(1, p.trail.length));
                ctx.fillStyle = rgba(base, a);
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, p.size * 0.65, 0, Math.PI * 2);
                ctx.fill();
            });

            const pulse = 0.85 + Math.sin(ts * 0.008 + p.drift) * 0.15;
            const r = p.size * pulse;

            const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 5);
            halo.addColorStop(0, rgba(glow, p.alpha * fade * 0.55));
            halo.addColorStop(0.45, rgba(base, p.alpha * fade * 0.2));
            halo.addColorStop(1, rgba(base, 0));
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r * 5, 0, Math.PI * 2);
            ctx.fill();

            const core = ctx.createRadialGradient(p.x - r * 0.25, p.y - r * 0.25, 0, p.x, p.y, r * 1.4);
            core.addColorStop(0, rgba({ r: 255, g: 255, b: 255 }, p.shine ? 0.95 * fade : 0.5 * fade));
            core.addColorStop(0.35, rgba(glow, p.alpha * fade));
            core.addColorStop(1, rgba(base, 0));
            ctx.fillStyle = core;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r * 1.4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
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
