const EFFECT_PALETTE = {
    damage: { source: 0xffaa55, target: 0xff3344, glow: 0xff6644 },
    heal: { source: 0xa8ffd2, target: 0x3ce08a, glow: 0x5bffae },
    buff: { source: 0x9adfff, target: 0x3a98ff, glow: 0x5cbcff },
    freeze: { source: 0xdff0ff, target: 0x7adfff, glow: 0xa6edff },
    move: { source: 0xe2c2ff, target: 0x9a55ff, glow: 0xb985ff },
    default: { source: 0xffd28a, target: 0xffaa55, glow: 0xffbd70 }
};

const SAMPLE_COUNT = 32;
const ENTRY_STAGGER_MS = 40;
const ENTRY_FADE_MS = 200;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function lerp(start, end, t) {
    return start + ((end - start) * t);
}

function lerpColor(a, b, t) {
    const ar = (a >> 16) & 255;
    const ag = (a >> 8) & 255;
    const ab = a & 255;
    const br = (b >> 16) & 255;
    const bg = (b >> 8) & 255;
    const bb = b & 255;
    return ((Math.round(lerp(ar, br, t)) << 16)
        | (Math.round(lerp(ag, bg, t)) << 8)
        | Math.round(lerp(ab, bb, t)));
}

function quadPoint(s, c, t, u) {
    const inv = 1 - u;
    return {
        x: (inv * inv * s.x) + (2 * inv * u * c.x) + (u * u * t.x),
        y: (inv * inv * s.y) + (2 * inv * u * c.y) + (u * u * t.y)
    };
}

function controlPoint(s, t, sceneCenterY) {
    const mx = (s.x + t.x) / 2;
    const my = (s.y + t.y) / 2;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const len = Math.hypot(dx, dy) || 1;
    let px = -dy / len;
    let py = dx / len;
    const dirSign = my > sceneCenterY ? -1 : 1;
    if (Math.abs(dy) < 8) {
        px = 0;
        py = -1;
    }
    const k = clamp(len * 0.2, 24, 140);
    return {
        x: mx + (px * k * dirSign),
        y: my + (py * k * dirSign)
    };
}

function sampleCurve(source, control, target) {
    const points = [];
    for (let i = 0; i <= SAMPLE_COUNT; i += 1) {
        points.push(quadPoint(source, control, target, i / SAMPLE_COUNT));
    }
    return points;
}

export class TargetArrowLayer {
    constructor(PIXI) {
        this.PIXI = PIXI;
        this.container = new PIXI.Container();
        this.container.visible = false;
        this.graphics = new PIXI.Graphics();
        this.container.addChild(this.graphics);
        this.source = null;
        this.targets = [];
        this.kind = "default";
        this.sceneCenterY = 0;
        this.elapsedMs = 0;
        this.dashPhase = 0;
        this.pulseMs = 0;
        this.needsRedraw = false;
        this.reducedMotion = false;

        if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
            this.motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
            this.reducedMotion = Boolean(this.motionQuery.matches);
            const onMotionChange = () => {
                this.reducedMotion = Boolean(this.motionQuery.matches);
                this.needsRedraw = true;
            };
            if (typeof this.motionQuery.addEventListener === "function") {
                this.motionQuery.addEventListener("change", onMotionChange);
            } else if (typeof this.motionQuery.addListener === "function") {
                this.motionQuery.addListener(onMotionChange);
            }
        }
    }

    update(deltaMs) {
        if (!this.source || this.targets.length === 0) {
            return;
        }
        this.elapsedMs += deltaMs;
        if (!this.reducedMotion) {
            this.dashPhase = (this.dashPhase + (deltaMs * 0.0006)) % 1;
            this.pulseMs += deltaMs;
            this.draw();
            return;
        }
        if (this.needsRedraw) {
            this.draw();
        }
    }

    setPreview(source, targets, kind = "default", sceneCenterY = 0) {
        if (!source || !Array.isArray(targets) || targets.length === 0) {
            this.clear();
            return;
        }
        this.source = { x: Number(source.x) || 0, y: Number(source.y) || 0 };
        this.targets = targets
            .filter(Boolean)
            .slice(0, 9)
            .map((target, index) => ({
                x: Number(target.x) || 0,
                y: Number(target.y) || 0,
                appearedAt: index * ENTRY_STAGGER_MS
            }));
        this.kind = EFFECT_PALETTE[kind] ? kind : "default";
        this.sceneCenterY = Number(sceneCenterY) || 0;
        this.elapsedMs = 0;
        this.dashPhase = 0;
        this.pulseMs = 0;
        this.container.visible = this.targets.length > 0;
        this.needsRedraw = true;
        this.draw();
    }

    clear() {
        this.source = null;
        this.targets = [];
        this.container.visible = false;
        this.graphics.clear();
        this.needsRedraw = false;
    }

    draw() {
        if (!this.source || this.targets.length === 0) {
            this.clear();
            return;
        }
        const palette = EFFECT_PALETTE[this.kind] || EFFECT_PALETTE.default;
        const g = this.graphics;
        g.clear();
        this.targets.forEach((target, index) => {
            const entryAlpha = this.reducedMotion ? 1 : clamp((this.elapsedMs - target.appearedAt) / ENTRY_FADE_MS, 0, 1);
            if (entryAlpha <= 0) {
                return;
            }
            const targetPoint = { x: target.x, y: target.y };
            const control = controlPoint(this.source, targetPoint, this.sceneCenterY);
            const points = sampleCurve(this.source, control, targetPoint);
            this.drawGlow(points, palette, entryAlpha);
            this.drawMainStroke(points, palette, entryAlpha);
            if (!this.reducedMotion) {
                this.drawDashes(control, targetPoint, palette, entryAlpha, index);
            }
            this.drawArrowhead(control, targetPoint, palette, entryAlpha);
            this.drawPulse(targetPoint, palette, entryAlpha);
        });
        this.drawSourcePip(palette);
        this.needsRedraw = false;
    }

    drawGlow(points, palette, alpha) {
        for (let i = 0; i < points.length - 1; i += 1) {
            this.graphics
                .moveTo(points[i].x, points[i].y)
                .lineTo(points[i + 1].x, points[i + 1].y)
                .stroke({ color: palette.glow, width: 10, alpha: 0.18 * alpha });
        }
    }

    drawMainStroke(points, palette, alpha) {
        for (let i = 0; i < points.length - 1; i += 1) {
            const t = i / Math.max(1, points.length - 2);
            this.graphics
                .moveTo(points[i].x, points[i].y)
                .lineTo(points[i + 1].x, points[i + 1].y)
                .stroke({
                    color: lerpColor(palette.source, palette.target, t),
                    width: 2.5,
                    alpha: 0.94 * alpha
                });
        }
    }

    drawDashes(control, target, palette, alpha, curveIndex) {
        const dashColor = lerpColor(0xffffff, palette.target, 0.28);
        const dashLength = 0.06;
        for (let i = 0; i < 6; i += 1) {
            const u0 = (this.dashPhase + (i / 6) + (curveIndex * 0.04)) % 1;
            const u1 = Math.min(1, u0 + dashLength);
            const p0 = quadPoint(this.source, control, target, u0);
            const p1 = quadPoint(this.source, control, target, u1);
            this.graphics
                .moveTo(p0.x, p0.y)
                .lineTo(p1.x, p1.y)
                .stroke({ color: dashColor, width: 4, alpha: 0.72 * alpha });
        }
    }

    drawArrowhead(control, target, palette, alpha) {
        const tail = quadPoint(this.source, control, target, 0.965);
        const angle = Math.atan2(target.y - tail.y, target.x - tail.x);
        const size = 14;
        const spread = 0.52;
        const left = {
            x: target.x - (Math.cos(angle - spread) * size),
            y: target.y - (Math.sin(angle - spread) * size)
        };
        const right = {
            x: target.x - (Math.cos(angle + spread) * size),
            y: target.y - (Math.sin(angle + spread) * size)
        };
        this.graphics
            .moveTo(target.x, target.y)
            .lineTo(left.x, left.y)
            .lineTo(right.x, right.y)
            .closePath()
            .fill({ color: palette.target, alpha: 0.92 * alpha });
    }

    drawPulse(target, palette, alpha) {
        const pulse = this.reducedMotion ? 0 : Math.sin(this.pulseMs * 0.01);
        const radius = this.reducedMotion ? 10 : 8 + (4 * ((pulse + 1) / 2));
        const ringAlpha = this.reducedMotion ? 0.36 : 0.18 + (0.22 * ((pulse + 1) / 2));
        this.graphics
            .circle(target.x, target.y, radius)
            .stroke({ color: palette.target, width: 2, alpha: ringAlpha * alpha });
    }

    drawSourcePip(palette) {
        this.graphics
            .circle(this.source.x, this.source.y, 12)
            .fill({ color: palette.source, alpha: 0.16 });
        this.graphics
            .circle(this.source.x, this.source.y, 5)
            .fill({ color: palette.source, alpha: 0.5 });
    }
}
