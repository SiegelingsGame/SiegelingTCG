export class FxLayer {
    constructor(PIXI) {
        this.PIXI = PIXI;
        this.container = new PIXI.Container();
        this.activeTweens = [];
    }

    update(deltaMs) {
        this.activeTweens = this.activeTweens.filter((tween) => {
            tween.elapsed += deltaMs;
            if (tween.elapsed < 0) {
                return true;
            }
            const t = Math.min(1, tween.elapsed / tween.duration);
            tween.step(t);
            if (t >= 1) {
                if (typeof tween.done === "function") {
                    tween.done();
                }
                return false;
            }
            return true;
        });
    }

    tween(duration, step, done, delayMs = 0) {
        this.activeTweens.push({
            duration: Math.max(1, duration),
            elapsed: -Math.max(0, delayMs),
            step,
            done
        });
    }

    easeOutCubic(t) {
        return 1 - ((1 - t) ** 3);
    }

    cameraShake(target, intensity = 8, duration = 240) {
        const originX = target.x;
        const originY = target.y;
        this.tween(duration, (t) => {
            const damp = 1 - t;
            target.x = originX + ((Math.random() * 2 - 1) * intensity * damp);
            target.y = originY + ((Math.random() * 2 - 1) * intensity * damp);
        }, () => {
            target.x = originX;
            target.y = originY;
        });
    }

    floatingText(text, x, y, color = 0xffffff) {
        const label = new this.PIXI.Text({
            text: String(text),
            style: {
                fill: color,
                fontSize: 24,
                fontWeight: "700",
                stroke: { color: 0x000000, width: 4 }
            }
        });
        label.anchor.set(0.5);
        label.position.set(x, y);
        this.container.addChild(label);
        this.tween(700, (t) => {
            label.y = y - (48 * t);
            label.alpha = 1 - t;
            label.scale.set(1 + (0.15 * t));
        }, () => {
            this.container.removeChild(label);
            label.destroy();
        });
    }

    floatingDamageText(text, x, y, color = 0xffffff) {
        const label = new this.PIXI.Text({
            text: String(text),
            style: {
                fill: color,
                fontSize: 30,
                fontWeight: "900",
                stroke: { color: 0x000000, width: 5 }
            }
        });
        label.anchor.set(0.5);
        label.position.set(x, y);
        this.container.addChild(label);
        const duration = 1100;
        this.tween(duration, (t) => {
            label.y = y - (56 * t);
            label.alpha = 1 - (t * t);
            label.scale.set(1 + (0.22 * t));
        }, () => {
            this.container.removeChild(label);
            label.destroy();
        });
    }

    impactBurst(x, y, color = 0xffd700) {
        const count = 22;
        for (let i = 0; i < count; i += 1) {
            const particle = new this.PIXI.Graphics();
            particle.circle(0, 0, 2 + Math.random() * 4).fill(color);
            particle.position.set(x, y);
            this.container.addChild(particle);
            const angle = (Math.PI * 2 * i) / count;
            const dist = 24 + Math.random() * 38;
            this.tween(520, (t) => {
                particle.x = x + Math.cos(angle) * dist * t;
                particle.y = y + Math.sin(angle) * dist * t;
                particle.alpha = 1 - t;
            }, () => {
                this.container.removeChild(particle);
                particle.destroy();
            });
        }
    }

    normalizeElement(element) {
        return String(element || "").toUpperCase();
    }

    buildProjectileProfile(element, color, radius) {
        const normalized = this.normalizeElement(element);
        const defaults = {
            element: normalized,
            color,
            radius,
            shape: "orb",
            trail: "spark",
            trailInterval: 22,
            trailLife: 220
        };
        switch (normalized) {
            case "FIRE": return { ...defaults, shape: "flame", trail: "ember", trailInterval: 16, trailLife: 240 };
            case "EARTH": return { ...defaults, shape: "chunk", trail: "dust", trailInterval: 30, trailLife: 200 };
            case "WIND": return { ...defaults, shape: "gust", trail: "mist", trailInterval: 14, trailLife: 180 };
            case "WATER": return { ...defaults, shape: "droplet", trail: "splash", trailInterval: 18, trailLife: 220 };
            case "ICE": return { ...defaults, shape: "crystal", trail: "frost", trailInterval: 22, trailLife: 240 };
            case "SHADOW": return { ...defaults, shape: "voidOrb", trail: "shadow", trailInterval: 20, trailLife: 260 };
            case "ELECTRIC": return { ...defaults, shape: "bolt", trail: "arc", trailInterval: 12, trailLife: 160 };
            case "METAL": return { ...defaults, shape: "blade", trail: "shard", trailInterval: 20, trailLife: 220 };
            case "UNDEAD": return { ...defaults, shape: "skull", trail: "miasma", trailInterval: 26, trailLife: 260 };
            case "PSYCHIC": return { ...defaults, shape: "mindOrb", trail: "echo", trailInterval: 18, trailLife: 240 };
            default: return defaults;
        }
    }

    createProjectileNode(profile) {
        const r = profile.radius;
        const c = profile.color;
        const node = new this.PIXI.Container();

        const base = new this.PIXI.Graphics();
        if (profile.shape === "flame") {
            base.circle(0, 0, r).fill(c);
            base.circle(0, -r * 0.55, r * 0.55).fill(c);
            base.circle(0, 0, Math.max(2, r * 0.45)).fill(0xfff3b0);
        } else if (profile.shape === "droplet") {
            base.circle(0, r * 0.1, r).fill(c);
            base.roundRect(-r * 0.35, -r * 1.2, r * 0.7, r * 1.1, r * 0.28).fill(c);
            base.circle(0, -r * 0.95, r * 0.26).fill(0xd9f5ff);
        } else if (profile.shape === "gust") {
            base.circle(-r * 0.45, 0, r * 0.68).fill(c);
            base.circle(r * 0.35, -r * 0.2, r * 0.45).fill(c);
            base.roundRect(-r * 0.8, -r * 0.18, r * 1.7, r * 0.36, r * 0.2).fill(0xe9ffff);
        } else if (profile.shape === "chunk") {
            base.roundRect(-r * 0.72, -r * 0.72, r * 1.45, r * 1.45, 2).fill(c);
            base.roundRect(-r * 0.3, -r * 0.3, r * 0.6, r * 0.6, 2).fill(0xf3dcb2);
        } else if (profile.shape === "crystal") {
            base.roundRect(-r * 0.52, -r * 0.52, r * 1.05, r * 1.05, 1).fill(c);
            base.rotation = Math.PI / 4;
            const core = new this.PIXI.Graphics();
            core.roundRect(-r * 0.2, -r * 0.2, r * 0.4, r * 0.4, 1).fill(0xf1fdff);
            core.rotation = Math.PI / 4;
            node.addChild(base);
            node.addChild(core);
            return node;
        } else if (profile.shape === "voidOrb") {
            base.circle(0, 0, r).fill(c);
            base.circle(0, 0, r * 0.68).fill(0x131125);
            base.circle(r * 0.2, -r * 0.2, r * 0.2).fill(0xd2b2ff);
        } else if (profile.shape === "bolt") {
            base.roundRect(-r * 0.2, -r * 1.2, r * 0.4, r * 2.4, 1).fill(c);
            base.roundRect(-r * 0.65, -r * 0.35, r * 1.3, r * 0.28, 1).fill(0xffffd0);
            base.roundRect(-r * 0.4, r * 0.2, r * 0.8, r * 0.22, 1).fill(0xffffd0);
        } else if (profile.shape === "blade") {
            base.roundRect(-r * 1.2, -r * 0.25, r * 2.4, r * 0.5, 2).fill(c);
            base.roundRect(-r * 0.95, -r * 0.12, r * 1.9, r * 0.24, 2).fill(0xf2f8ff);
        } else if (profile.shape === "skull") {
            base.circle(0, -r * 0.1, r).fill(c);
            base.roundRect(-r * 0.65, r * 0.55, r * 1.3, r * 0.7, 2).fill(c);
            base.circle(-r * 0.35, -r * 0.2, r * 0.22).fill(0x111111);
            base.circle(r * 0.35, -r * 0.2, r * 0.22).fill(0x111111);
        } else if (profile.shape === "mindOrb") {
            base.circle(0, 0, r).fill(c);
            base.circle(0, 0, r * 0.55).fill(0xfff0ff);
            const orbit = new this.PIXI.Graphics();
            orbit.roundRect(-r * 1.1, -r * 0.08, r * 2.2, r * 0.16, 2).fill(c);
            orbit.alpha = 0.65;
            orbit.rotation = Math.PI / 5;
            node.addChild(base);
            node.addChild(orbit);
            return node;
        } else {
            base.circle(0, 0, r).fill(c);
            base.circle(0, 0, Math.max(2, r - 2)).fill(0xffffff);
        }

        node.addChild(base);
        return node;
    }

    spawnProjectileTrail(profile, x, y) {
        const particle = new this.PIXI.Graphics();
        const spread = (Math.random() * 10) - 5;
        const size = Math.max(1.6, profile.radius * (0.28 + (Math.random() * 0.25)));
        const life = profile.trailLife;
        const driftX = (Math.random() * 24) - 12;
        const driftY = 10 + (Math.random() * 16);
        const px = x + spread;
        const py = y + spread;

        switch (profile.trail) {
            case "ember":
                particle.circle(0, 0, size).fill(profile.color);
                break;
            case "dust":
                particle.roundRect(-size * 0.6, -size * 0.4, size * 1.2, size * 0.8, 1).fill(profile.color);
                break;
            case "mist":
            case "shadow":
            case "miasma":
                particle.circle(0, 0, size * 1.1).fill(profile.color);
                particle.alpha = 0.7;
                break;
            case "splash":
                particle.roundRect(-size * 0.25, -size, size * 0.5, size * 2, 1).fill(profile.color);
                break;
            case "frost":
            case "shard":
                particle.roundRect(-size * 0.45, -size * 0.45, size * 0.9, size * 0.9, 1).fill(profile.color);
                particle.rotation = Math.PI / 4;
                break;
            case "arc":
                particle.roundRect(-size * 0.1, -size * 1.1, size * 0.2, size * 2.2, 1).fill(profile.color);
                break;
            case "echo":
                particle.circle(0, 0, size).stroke({ color: profile.color, width: 1.5 });
                break;
            default:
                particle.circle(0, 0, size).fill(profile.color);
                break;
        }

        particle.position.set(px, py);
        this.container.addChild(particle);
        this.tween(life, (t) => {
            particle.x = px + (driftX * t);
            particle.y = py + (driftY * t);
            particle.alpha = (1 - t) * 0.8;
            particle.scale.set(1 - (0.3 * t));
        }, () => {
            this.container.removeChild(particle);
            particle.destroy();
        });
    }

    launchProjectile(from, to, options = {}) {
        const color = options.color ?? 0xffd700;
        const radius = options.radius ?? 6;
        const duration = options.duration ?? 1000;
        const arc = options.arc ?? 42;
        const delay = options.delay ?? 0;
        const onHit = options.onHit;
        const profile = this.buildProjectileProfile(options.element, color, radius);
        const trailEvery = Math.max(10, Math.round(profile.trailInterval * (380 / Math.max(320, duration))));
        const bolt = this.createProjectileNode(profile);
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        bolt.position.set(from.x, from.y);
        bolt.rotation = angle;
        this.container.addChild(bolt);
        let lastTrailMs = -Infinity;

        this.tween(duration, (tRaw) => {
            const t = this.easeOutCubic(tRaw);
            const x = from.x + ((to.x - from.x) * t);
            const yLinear = from.y + ((to.y - from.y) * t);
            const yArc = Math.sin(Math.PI * tRaw) * arc;
            bolt.position.set(x, yLinear - yArc);
            bolt.rotation = angle;
            bolt.alpha = 0.8 + (0.2 * (1 - tRaw));
            bolt.scale.set(1 + (0.1 * (1 - tRaw)));
            const elapsedMs = tRaw * duration;
            if (elapsedMs - lastTrailMs >= trailEvery) {
                lastTrailMs = elapsedMs;
                this.spawnProjectileTrail(profile, x, yLinear - yArc);
            }
        }, () => {
            this.container.removeChild(bolt);
            bolt.destroy();
            if (typeof onHit === "function") {
                onHit();
            }
        }, delay);
    }

    glowPulse(target, color = 0xffd700, duration = 320) {
        const glow = new this.PIXI.Graphics();
        const bounds = target.getBounds();
        glow.roundRect(
            bounds.x - 6,
            bounds.y - 6,
            bounds.width + 12,
            bounds.height + 12,
            14
        ).stroke({ color, width: 4, alpha: 0.85 });
        this.container.addChild(glow);
        this.tween(duration, (t) => {
            glow.alpha = 1 - t;
            glow.scale.set(1 + (0.08 * t));
        }, () => {
            this.container.removeChild(glow);
            glow.destroy();
        });
    }

    phaseFlash(width, height, label) {
        const overlay = new this.PIXI.Graphics();
        overlay.rect(0, 0, width, height).fill({ color: 0xd4a44a, alpha: 0.12 });
        this.container.addChild(overlay);

        const banner = new this.PIXI.Text({
            text: `${label} PHASE`,
            style: {
                fill: 0xffe6a5,
                fontSize: 42,
                fontWeight: "800",
                stroke: { color: 0x1b1428, width: 5 }
            }
        });
        banner.anchor.set(0.5);
        banner.position.set(width / 2, Math.max(120, height * 0.2));
        this.container.addChild(banner);

        this.tween(520, (t) => {
            overlay.alpha = (1 - t) * 0.9;
            banner.alpha = 1 - t;
            banner.scale.set(0.9 + (0.2 * t));
        }, () => {
            this.container.removeChild(overlay);
            this.container.removeChild(banner);
            overlay.destroy();
            banner.destroy();
        });
    }
}
