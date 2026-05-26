/**
 * Landing hero — dispersed element particle auras.
 * Canvas + CSS orb fallback (CSS shows when reduced-motion is on or canvas fails).
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
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'hero-particle-canvas';
            this.canvas.setAttribute('aria-hidden', 'true');
            this.domLayer = document.createElement('div');
            this.domLayer.className = 'hero-particle-dom';
            this.domLayer.setAttribute('aria-hidden', 'true');
            hero.appendChild(this.canvas);
            hero.appendChild(this.domLayer);

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
            this.orbitRadius = 280;
            this.motionScale = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.45 : 1;

            this._onResize = () => this.resize();
            window.addEventListener('resize', this._onResize);
            this.resize();
            this.resolvePalette();
        }

        resize() {
            const rect = this.hero.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            this.width = Math.max(1, rect.width);
            this.height = Math.max(1, rect.height);
            if (this.canvasOk) {
                this.canvas.width = Math.round(this.width * dpr);
                this.canvas.height = Math.round(this.height * dpr);
                this.canvas.style.width = `${this.width}px`;
                this.canvas.style.height = `${this.height}px`;
                this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }
            this.center.x = this.width * 0.5;
            this.center.y = this.height * 0.46;
            this.orbitRadius = Math.min(this.width, this.height) * 0.52;
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
            this.domLayer.style.opacity = '1';
            this.canvas.style.opacity = '1';
            this.ensureLoop();
        }

        clearHighlight() {
            this.targetIntensity = 0;
            this.highlightIndex = -1;
            window.setTimeout(() => {
                if (this.targetIntensity === 0) {
                    this.hero.classList.remove('hero-particles-active');
                    this.domLayer.innerHTML = '';
                    this.domLayer.style.opacity = '0';
                }
            }, 650);
        }

        fadeOut() {
            this.targetIntensity = 0;
            this.highlightIndex = -1;
            this.hero.classList.remove('hero-particles-active');
            this.domLayer.innerHTML = '';
            this.domLayer.style.opacity = '0';
        }

        syncDomOrbs(activeIndex) {
            const inactive = this.palette
                .map((el, i) => ({ el, i }))
                .filter(({ i }) => i !== activeIndex);

            const parts = [];
            inactive.forEach(({ el, i }, swarmIndex) => {
                const orbCount = 5;
                for (let o = 0; o < orbCount; o += 1) {
                    const delay = (swarmIndex * 1.7 + o * 0.85).toFixed(2);
                    const orbit = (28 + o * 11 + swarmIndex * 6).toFixed(0);
                    const size = (88 + o * 18 + swarmIndex * 8).toFixed(0);
                    parts.push(
                        `<span class="hero-particle-orb hero-particle-orb-${el.key}" ` +
                        `style="--orb-delay:${delay}s;--orb-orbit:${orbit}vmin;--orb-size:${size}px"></span>`
                    );
                }
                for (let s = 0; s < 10; s += 1) {
                    const delay = (swarmIndex * 2.1 + s * 0.35).toFixed(2);
                    const orbit = (18 + s * 5 + swarmIndex * 4).toFixed(0);
                    parts.push(
                        `<span class="hero-particle-spark hero-particle-spark-${el.key}" ` +
                        `style="--orb-delay:${delay}s;--orb-orbit:${orbit}vmin"></span>`
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
                const count = Math.round((38 + rand(0, 16)) * scale);
                const auraCount = Math.max(2, Math.round((4 + (swarmIndex % 2)) * scale));
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
            const speed = this.motionScale;
            return {
                kind: 'aura',
                el,
                angle: phase + rand(0, Math.PI * 2),
                angleVel: rand(0.00035, 0.00075) * speed * (Math.random() > 0.5 ? 1 : -1),
                radius: this.orbitRadius * rand(0.5, 0.98),
                radiusVel: rand(-0.02, 0.02) * speed,
                wobbleX: rand(0.4, 1.1),
                wobbleY: rand(0.4, 1.1),
                wobblePhase: rand(0, Math.PI * 2),
                size: rand(100, 190),
                alpha: rand(0.22, 0.42),
                bandOffset,
                drift: rand(0, 1000)
            };
        }

        createParticle(el, bandOffset, along) {
            const speed = this.motionScale;
            return {
                kind: 'spark',
                el,
                angle: along * Math.PI * 2 + bandOffset + rand(-0.25, 0.25),
                angleVel: rand(0.00085, 0.002) * speed * (Math.random() > 0.5 ? 1 : -1),
                radius: this.orbitRadius * rand(0.28, 1.05),
                radiusVel: rand(-0.05, 0.05) * speed,
                wobbleX: rand(0.8, 2.4),
                wobbleY: rand(0.8, 2.4),
                wobblePhase: rand(0, Math.PI * 2),
                size: rand(3, 8),
                shine: Math.random() > 0.35,
                alpha: rand(0.75, 1),
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

            this.intensity = lerp(this.intensity, this.targetIntensity, 0.14);
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
                this.canvas.style.opacity = '0';
                this.domLayer.style.opacity = '0';
            }
        }

        update(dt, ts) {
            const t = ts * 0.001;
            const cx = this.center.x;
            const cy = this.center.y;
            const pull = 0.00005 * dt * this.motionScale;

            const step = (item) => {
                item.angle += item.angleVel * dt;
                item.radius += item.radiusVel * dt;
                const minR = this.orbitRadius * 0.18;
                const maxR = this.orbitRadius * 1.12;
                if (item.radius < minR || item.radius > maxR) {
                    item.radiusVel *= -1;
                    item.radius = clamp(item.radius, minR, maxR);
                }
                const wobT = t * 0.9 + item.drift * 0.001;
                const ox = Math.sin(wobT * item.wobbleX + item.wobblePhase) * (item.kind === 'aura' ? 40 : 22);
                const oy = Math.cos(wobT * item.wobbleY + item.wobblePhase * 1.3) * (item.kind === 'aura' ? 32 : 16);
                item.x = cx + Math.cos(item.angle) * item.radius + ox;
                item.y = cy + Math.sin(item.angle) * item.radius * 0.82 + oy;

                if (item.kind === 'spark') {
                    item.trail.push({ x: item.x, y: item.y, life: 1 });
                    if (item.trail.length > 8) item.trail.shift();
                    item.trail.forEach((pt) => { pt.life -= 0.16 * (dt / 16); });
                    item.trail = item.trail.filter((pt) => pt.life > 0.04);
                }
            };

            this.auras.forEach(step);
            this.particles.forEach(step);
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
            grd.addColorStop(0, rgba(glow, a.alpha * fade * 1.35));
            grd.addColorStop(0.35, rgba(base, a.alpha * fade * 0.9));
            grd.addColorStop(0.72, rgba(base, a.alpha * fade * 0.35));
            grd.addColorStop(1, rgba(base, 0));
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.ellipse(a.x, a.y, a.size, a.size * 0.72, a.angle * 0.15, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = rgba(glow, a.alpha * fade * 0.5);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(a.x, a.y, a.size * 0.62, a.size * 0.4, -a.angle * 0.2, 0, Math.PI * 2);
            ctx.stroke();
        }

        drawSpark(ctx, p, fade, ts) {
            const { base, glow } = p.el;
            p.trail.forEach((pt, i) => {
                const a = pt.life * p.alpha * fade * 0.5 * (i / Math.max(1, p.trail.length));
                ctx.fillStyle = rgba(base, a);
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, p.size * 0.7, 0, Math.PI * 2);
                ctx.fill();
            });

            const pulse = 0.85 + Math.sin(ts * 0.008 + p.drift) * 0.15;
            const r = p.size * pulse;

            const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 6);
            halo.addColorStop(0, rgba(glow, p.alpha * fade * 0.75));
            halo.addColorStop(0.45, rgba(base, p.alpha * fade * 0.35));
            halo.addColorStop(1, rgba(base, 0));
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r * 6, 0, Math.PI * 2);
            ctx.fill();

            const core = ctx.createRadialGradient(p.x - r * 0.25, p.y - r * 0.25, 0, p.x, p.y, r * 1.6);
            core.addColorStop(0, rgba({ r: 255, g: 255, b: 255 }, p.shine ? 1 * fade : 0.65 * fade));
            core.addColorStop(0.35, rgba(glow, p.alpha * fade));
            core.addColorStop(1, rgba(base, 0));
            ctx.fillStyle = core;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r * 1.6, 0, Math.PI * 2);
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
