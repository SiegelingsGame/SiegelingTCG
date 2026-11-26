/*
 * PixelForge preset library. Pure data: every entry is a spec that core.js renders.
 * Categories: attack (character moves), impact, projectile, aura/status, cutscene.
 * `for` lists which projects the preset was tuned for (all three share the same element set).
 */
(function (root, factory) {
  var defs = factory();
  if (typeof module === 'object' && module.exports) module.exports = defs;
  else if (root.PixelForge) for (var k in defs) root.PixelForge.register(k, defs[k]);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var ALL = ['siegelings', 'animevs', 'generations'];
  var OUT = [{ type: 'outline', color: '#120a1a' }];
  function k(pairs, ease) { return { keys: pairs, ease: ease }; }
  function ft(from, to, ease, start, end) { return { from: from, to: to, ease: ease, start: start, end: end }; }

  var P = {};

  // ── melee / attacks ─────────────────────────────────────────────────────
  P['sword-slash'] = { category: 'attack', element: 'metal', for: ALL, desc: 'Clean steel crescent with spark flecks.', spec: {
    w: 64, h: 64, frames: 12, fps: 16, seed: 3, layers: [
      { type: 'slash', x: 30, y: 34, radius: 25, angle: -40, arc: 190, thickness: 10, squash: 0.6, tilt: -20, ramp: 'metal', progress: ft(0, 1.8, 'outCubic'), trail: 0.8 },
      { type: 'particles', start: 0.15, end: 0.8, x: 46, y: 22, count: 10, spawn: 0.15, life: 0.7, angle: -30, spread: 120, speed: 60, size: 1, sizeEnd: 0.3, shape: 'spark', streak: 1.5, ramp: 'gold' }
    ], post: OUT } };

  P['fire-slash'] = { category: 'attack', element: 'fire', for: ALL, desc: 'Blazing double arc that sheds embers.', spec: {
    w: 64, h: 64, frames: 14, fps: 16, seed: 7, layers: [
      { type: 'slash', x: 32, y: 34, radius: 22, angle: -30, arc: 200, thickness: 9, squash: 0.6, tilt: -15, ramp: 'fire', progress: ft(0, 1.7, 'outCubic') },
      { type: 'slash', start: 0.15, x: 32, y: 36, radius: 16, angle: 150, arc: 160, thickness: 6, squash: 0.6, tilt: -15, flip: 'ccw', ramp: 'fire', progress: ft(0, 1.6, 'outCubic') },
      { type: 'particles', start: 0.1, x: 32, y: 34, count: 30, spawn: 0.4, life: 0.6, angle: -90, spread: 220, speed: 40, gravity: -40, size: 1.4, sizeEnd: 0.3, ramp: 'fire', areaX: 14, areaY: 8 }
    ], post: OUT } };

  P['claw-swipe'] = { category: 'attack', element: 'shadow', for: ALL, desc: 'Three-line beast claw rake.', spec: {
    w: 64, h: 64, frames: 10, fps: 18, seed: 9, layers: [0, 1, 2].map(function (i) {
      return { type: 'slash', start: i * 0.06, x: 22 + i * 7, y: 46 - i * 2, radius: 28, angle: -120, arc: 85, thickness: 4.5, squash: 1, tilt: 0, ramp: 'blood', progress: ft(0, 1.5, 'outQuad'), trail: 0.7 };
    }), post: OUT } };

  P['spin-slash'] = { category: 'attack', element: 'wind', for: ALL, desc: 'Full 360 whirl, wind-tinted.', spec: {
    w: 64, h: 64, frames: 14, fps: 16, seed: 4, layers: [
      { type: 'slash', x: 32, y: 36, radius: 24, angle: 90, arc: 360, thickness: 6, squash: 0.45, ramp: 'wind', progress: ft(0, 1.5, 'outCubic'), trail: 0.7 },
      { type: 'particles', x: 32, y: 36, count: 24, spawn: 0.5, life: 0.5, angle: 0, spread: 360, speed: 70, size: 1, shape: 'streak', streak: 2, ramp: 'wind', swirl: 4 }
    ], post: OUT } };

  P['crit-hit'] = { category: 'impact', element: 'light', for: ALL, desc: 'Star-burst critical hit spark.', spec: {
    w: 48, h: 48, frames: 9, fps: 18, seed: 11, layers: [
      { type: 'rays', x: 24, y: 24, count: 8, length: k([[0, 4], [0.25, 22], [1, 22]], 'outQuad'), inner: k([[0, 0], [0.4, 2], [1, 20]]), width: 4, variance: 0.3, ramp: 'light' },
      { type: 'ring', x: 24, y: 24, radius: ft(1, 20, 'outCubic'), thickness: ft(1.5, 0.3), breakup: 0.3, ramp: 'white', end: 0.6 },
      { type: 'particles', x: 24, y: 24, count: 14, spawn: 0.05, life: 0.8, speed: 80, size: 1, shape: 'spark', ramp: 'gold' }
    ], post: OUT } };

  P['hit-spark'] = { category: 'impact', element: 'neutral', for: ALL, desc: 'Small generic hit, use on every damage tick.', spec: {
    w: 32, h: 32, frames: 7, fps: 20, seed: 2, layers: [
      { type: 'rays', x: 16, y: 16, count: 6, length: k([[0, 2], [0.3, 12], [1, 13]]), inner: k([[0, 0], [0.5, 2], [1, 12]]), width: 2.5, ramp: 'mono' },
      { type: 'particles', x: 16, y: 16, count: 8, spawn: 0.05, life: 0.7, speed: 50, size: 0.8, shape: 'square', ramp: 'gold' }
    ], post: OUT } };

  // ── fire ────────────────────────────────────────────────────────────────
  P['fireball'] = { category: 'projectile', element: 'fire', for: ALL, desc: 'Boiling fireball flies left->right, bursts on arrival.', spec: {
    w: 96, h: 48, frames: 18, fps: 16, seed: 5, pivot: [84, 24], layers: [
      { type: 'orb', end: 0.7, x0: 8, y0: 26, x1: 84, y1: 24, radius: 5, tail: 12, arcHeight: 6, ramp: 'fire', travel: ft(0, 1, 'inQuad') },
      { type: 'particles', end: 0.7, x: ft(8, 84, 'inQuad'), y: 25, count: 30, spawn: 1, life: 0.25, angle: 180, spread: 80, speed: 40, gravity: -30, size: 1.5, ramp: 'fire' },
      { type: 'cloud', start: 0.66, x: 84, y: 24, count: 7, radius: ft(3, 8, 'outCubic'), spread: ft(2, 9, 'outCubic'), ramp: 'fire' },
      { type: 'ring', start: 0.66, end: 0.95, x: 84, y: 24, radius: ft(2, 16, 'outCubic'), thickness: ft(3, 0.4), ramp: 'gold' }
    ], post: OUT } };

  P['flame-pillar'] = { category: 'attack', element: 'fire', for: ALL, desc: 'Ground-rooted column of fire with rising embers.', spec: {
    w: 48, h: 80, frames: 16, fps: 14, seed: 6, pivot: [24, 74], layers: [
      { type: 'circle', x: 24, y: 72, radius: ft(0, 16, 'outBack', 0, 0.2), rings: 1, runes: 10, star: 0, squash: 0.35, ramp: 'fire' },
      { type: 'flame', x: 24, y: 72, width: 12, height: k([[0, 0], [0.2, 66], [0.8, 70], [1, 0]], 'outQuad'), ramp: 'fire', turbulence: 0.9, taper: 0.55 },
      { type: 'particles', x: 24, y: 70, count: 40, spawn: 0.8, life: 0.4, angle: -90, spread: 30, speed: 140, size: 1, sizeEnd: 0.2, ramp: 'gold', areaX: 8 }
    ], post: OUT } };

  P['explosion'] = { category: 'impact', element: 'fire', for: ALL, desc: 'Flash -> fireball -> smoke dissolve.', spec: {
    w: 64, h: 64, frames: 18, fps: 16, seed: 8, layers: [
      { type: 'cloud', end: 1, x: 32, y: 34, count: 12, radius: ft(4, 11, 'outCubic'), spread: ft(2, 16, 'outCubic'), rise: ft(0, -10), ramp: 'smoke', dissolve: k([[0, 0], [0.5, 0.2], [1, 1]], 'inQuad') },
      { type: 'cloud', end: 0.65, x: 32, y: 34, count: 9, radius: ft(5, 8, 'outCubic'), spread: ft(1, 11, 'outCubic'), ramp: 'fire', bright: ft(1.4, 0.6) },
      { type: 'ring', end: 0.5, x: 32, y: 36, radius: ft(4, 30, 'outCubic'), thickness: ft(4, 0.5), squash: 0.7, ramp: 'gold' },
      { type: 'shards', x: 32, y: 34, count: 10, speed: 90, size: 1.6, shape: 'rock', gravity: 80, ramp: 'earth' }
    ], post: OUT } };

  // ── ice / water ─────────────────────────────────────────────────────────
  P['ice-shards'] = { category: 'attack', element: 'ice', for: ALL, desc: 'Crystal burst with a frost ring.', spec: {
    w: 64, h: 64, frames: 14, fps: 16, seed: 12, layers: [
      { type: 'ring', end: 0.6, x: 32, y: 34, radius: ft(2, 26, 'outCubic'), thickness: ft(3, 0.5), squash: 0.6, ramp: 'ice' },
      { type: 'shards', x: 32, y: 32, count: 14, speed: 110, size: 3, shape: 'diamond', gravity: 40, ramp: 'ice' },
      { type: 'particles', x: 32, y: 32, count: 20, spawn: 0.3, life: 0.8, speed: 30, gravity: 10, size: 0.8, shape: 'square', ramp: 'ice', areaX: 10, areaY: 10 }
    ], post: OUT } };

  P['frost-nova'] = { category: 'attack', element: 'ice', for: ALL, desc: 'Ground-hugging frost circle with spikes.', spec: {
    w: 80, h: 48, frames: 16, fps: 14, seed: 13, pivot: [40, 36], layers: [
      { type: 'circle', x: 40, y: 36, radius: ft(0, 30, 'outBack', 0, 0.3), rings: 2, runes: 16, star: 6, starStep: 2, squash: 0.35, ramp: 'ice' },
      { type: 'spikes', x: 14, y: 38, count: 6, spacing: 10.5, height: 18, width: 3, ramp: 'ice', stagger: 0.05 },
      { type: 'particles', x: 40, y: 30, count: 26, spawn: 0.6, life: 0.6, angle: -90, spread: 120, speed: 30, size: 0.8, ramp: 'white', areaX: 28, areaY: 6 }
    ], post: OUT } };

  P['water-splash'] = { category: 'impact', element: 'water', for: ALL, desc: 'Crown splash with droplets.', spec: {
    w: 64, h: 64, frames: 14, fps: 16, seed: 14, pivot: [32, 50], layers: [
      { type: 'ring', x: 32, y: 50, radius: ft(2, 26, 'outCubic'), thickness: ft(3, 0.5), squash: 0.3, ramp: 'water' },
      { type: 'particles', x: 32, y: 48, count: 40, spawn: 0.1, life: 0.9, angle: -90, spread: 100, speed: 120, gravity: 260, drag: 0.5, size: 1.6, sizeEnd: 0.8, ramp: 'water', hard: 1 },
      { type: 'flame', x: 32, y: 50, width: 10, height: k([[0, 0], [0.25, 26], [0.6, 18], [1, 0]]), mode: 'pillar', ramp: 'water', end: 0.8 }
    ], post: OUT } };

  P['tidal-beam'] = { category: 'attack', element: 'water', for: ALL, desc: 'Pressurised water beam with foam.', spec: {
    w: 96, h: 40, frames: 16, fps: 16, seed: 15, layers: [
      { type: 'beam', x0: 4, y0: 20, x1: 92, y1: 20, width: k([[0, 0], [0.15, 7], [0.8, 6], [1, 0]]), wobble: 0.4, ramp: 'water' },
      { type: 'particles', start: 0.1, x: 90, y: 20, count: 30, spawn: 0.8, life: 0.3, angle: 180, spread: 120, speed: 60, size: 1, ramp: 'white' }
    ], post: OUT } };

  // ── electric / wind / earth ─────────────────────────────────────────────
  P['lightning-strike'] = { category: 'attack', element: 'electric', for: ALL, desc: 'Sky bolt with branches and ground flash.', spec: {
    w: 48, h: 96, frames: 12, fps: 16, seed: 16, pivot: [24, 88], layers: [
      { type: 'bolt', x0: 22, y0: 0, x1: 24, y1: 88, depth: 5, jag: 0.4, branches: 4, ramp: 'electric', regen: 2 },
      { type: 'ring', start: 0.1, end: 0.7, x: 24, y: 88, radius: ft(2, 18, 'outCubic'), thickness: ft(3, 0.5), squash: 0.3, ramp: 'electric' },
      { type: 'particles', start: 0.1, x: 24, y: 86, count: 16, spawn: 0.3, life: 0.6, angle: -90, spread: 160, speed: 70, gravity: 120, size: 0.8, shape: 'spark', ramp: 'electric' }
    ], post: OUT } };

  P['chain-zap'] = { category: 'attack', element: 'electric', for: ALL, desc: 'Horizontal arc that jumps between targets.', spec: {
    w: 96, h: 40, frames: 12, fps: 16, seed: 17, layers: [
      { type: 'bolt', x0: 4, y0: 20, x1: 48, y1: 14, depth: 4, jag: 0.5, branches: 1, ramp: 'electric', end: 0.7 },
      { type: 'bolt', start: 0.25, x0: 48, y0: 14, x1: 92, y1: 24, depth: 4, jag: 0.5, branches: 1, ramp: 'electric' },
      { type: 'rays', start: 0.25, end: 0.6, x: 48, y: 14, count: 6, length: 9, width: 2, ramp: 'white' }
    ], post: OUT } };

  P['tornado'] = { category: 'attack', element: 'wind', for: ALL, desc: 'Swaying funnel with debris.', spec: {
    w: 56, h: 80, frames: 16, fps: 14, loop: false, seed: 18, pivot: [28, 74], layers: [
      { type: 'tornado', x: 28, y: 74, height: k([[0, 0], [0.2, 64], [0.85, 66], [1, 0]]), baseWidth: 3, topWidth: 18, ramp: 'wind' },
      { type: 'particles', x: 28, y: 60, count: 24, spawn: 1, life: 0.4, angle: -90, spread: 360, speed: 40, swirl: 10, size: 1.2, shape: 'square', ramp: 'earth', areaX: 10, areaY: 14 }
    ], post: OUT } };

  P['earth-spikes'] = { category: 'attack', element: 'earth', for: ALL, desc: 'Row of rock spikes erupting in sequence.', spec: {
    w: 96, h: 48, frames: 16, fps: 14, seed: 19, pivot: [48, 42], layers: [
      { type: 'spikes', x: 10, y: 42, count: 7, spacing: 12.5, height: 30, width: 5, ramp: 'earth', stagger: 0.06 },
      { type: 'cloud', x: 48, y: 40, count: 14, radius: ft(2, 5), spread: ft(10, 40), squash: 0.2, ramp: 'smoke', dissolve: k([[0, 0.2], [1, 1]]) },
      { type: 'shards', x: 48, y: 40, count: 12, angle: -90, spread: 140, speed: 80, size: 1.5, shape: 'rock', gravity: 200, ramp: 'earth' }
    ], post: OUT } };

  // ── poison / shadow / psychic / light / undead / arcane ────────────────
  P['poison-cloud'] = { category: 'attack', element: 'poison', for: ALL, desc: 'Lingering toxic cloud with bubbles (loops).', spec: {
    w: 64, h: 48, frames: 16, fps: 10, loop: true, seed: 20, layers: [
      { type: 'cloud', x: 32, y: 28, count: 10, radius: 8, spread: 14, rise: 0, ramp: 'poison', dissolve: 0.25, bright: 0.9, squash: 0.6 },
      { type: 'particles', x: 32, y: 34, count: 14, spawn: 1, life: 0.5, angle: -90, spread: 40, speed: 30, size: 1.2, sizeEnd: 1.6, ramp: 'poison', areaX: 18, hard: 1 }
    ], post: OUT } };

  P['shadow-void'] = { category: 'attack', element: 'shadow', for: ALL, desc: 'Black-hole vortex that swallows light.', spec: {
    w: 64, h: 64, frames: 18, fps: 14, seed: 21, layers: [
      { type: 'vortex', x: 32, y: 32, radius: k([[0, 0], [0.25, 26], [0.85, 26], [1, 0]], 'outQuad'), arms: 4, twist: 4, hole: 0.18, ramp: 'shadow' },
      { type: 'particles', x: 32, y: 32, count: 30, spawn: 0.8, life: 0.4, angle: 0, spread: 360, speed: -60, areaX: 26, areaY: 26, size: 1, shape: 'streak', ramp: 'psychic', drag: 0 }
    ], post: OUT } };

  P['psychic-wave'] = { category: 'attack', element: 'psychic', for: ALL, desc: 'Concentric mind rings pulsing outward.', spec: {
    w: 64, h: 64, frames: 16, fps: 14, seed: 22, layers: [0, 1, 2].map(function (i) {
      return { type: 'ring', start: i * 0.18, end: Math.min(1, i * 0.18 + 0.6), x: 32, y: 32, radius: ft(2, 28, 'outQuad'), thickness: ft(2.5, 1), breakup: 0.5, ramp: 'psychic' };
    }).concat([{ type: 'vortex', x: 32, y: 32, radius: k([[0, 0], [0.2, 8], [0.8, 8], [1, 0]]), arms: 2, twist: 2, spin: 720, ramp: 'psychic' }]), post: OUT } };

  P['holy-pillar'] = { category: 'attack', element: 'light', for: ALL, desc: 'Judgement beam from the sky with sigil.', spec: {
    w: 48, h: 96, frames: 16, fps: 14, seed: 23, pivot: [24, 88], layers: [
      { type: 'circle', x: 24, y: 88, radius: ft(0, 18, 'outBack', 0, 0.25), rings: 2, runes: 12, star: 6, squash: 0.3, ramp: 'light' },
      { type: 'flame', start: 0.15, x: 24, y: 88, width: 9, height: k([[0, 0], [0.2, 96], [0.8, 96], [1, 0]]), mode: 'pillar', ramp: 'light', scroll: -4 },
      { type: 'particles', start: 0.2, x: 24, y: 80, count: 30, spawn: 0.8, life: 0.5, angle: -90, spread: 10, speed: 80, size: 0.8, shape: 'square', ramp: 'white', areaX: 10 }
    ], post: OUT } };

  P['heal'] = { category: 'aura', element: 'heal', for: ALL, desc: 'Rising sparkles and soft cross glints.', spec: {
    w: 48, h: 64, frames: 16, fps: 12, seed: 24, pivot: [24, 56], layers: [
      { type: 'ring', x: 24, y: 56, radius: ft(4, 16, 'outQuad'), thickness: 1, squash: 0.3, ramp: 'heal', end: 0.7 },
      { type: 'particles', x: 24, y: 54, count: 34, spawn: 0.7, life: 0.5, angle: -90, spread: 20, speed: 60, size: 1.8, sizeEnd: 0.4, shape: 'spark', ramp: 'heal', areaX: 12 },
      { type: 'rays', start: 0.3, end: 0.8, x: 24, y: 30, count: 4, length: 8, width: 1.5, variance: 0, rotate: 45, ramp: 'white' }
    ], post: OUT } };

  P['soul-wisps'] = { category: 'attack', element: 'undead', for: ALL, desc: 'Ghost flames spiralling up (necro / undead).', spec: {
    w: 48, h: 72, frames: 16, fps: 12, loop: true, seed: 25, layers: [
      { type: 'flame', x: 24, y: 66, width: 9, height: 40, ramp: 'undead', turbulence: 1.2 },
      { type: 'particles', x: 24, y: 60, count: 12, spawn: 1, life: 0.7, angle: -90, spread: 30, speed: 70, swirl: 6, size: 2.4, sizeEnd: 0.6, ramp: 'undead' }
    ], post: OUT } };

  P['arcane-missile'] = { category: 'projectile', element: 'arcane', for: ALL, desc: 'Homing arcane bolt with sparkle trail.', spec: {
    w: 96, h: 48, frames: 14, fps: 16, seed: 26, pivot: [86, 24], layers: [
      { type: 'orb', end: 0.75, x0: 8, y0: 34, x1: 86, y1: 22, radius: 3.5, tail: 16, arcHeight: 14, ramp: 'arcane', boil: 0.2, travel: ft(0, 1, 'inOutQuad') },
      { type: 'rays', start: 0.72, x: 86, y: 22, count: 8, length: 14, width: 2, ramp: 'arcane' }
    ], post: OUT } };

  P['magic-circle'] = { category: 'aura', element: 'arcane', for: ALL, desc: 'Rotating summoning circle (loops).', spec: {
    w: 64, h: 40, frames: 20, fps: 12, loop: true, seed: 27, layers: [
      { type: 'circle', x: 32, y: 20, radius: 28, rings: 3, runes: 24, star: 5, starStep: 2, spin: 90, squash: 0.5, bright: 1, ramp: 'arcane' }
    ], post: OUT } };

  P['shield-bubble'] = { category: 'aura', element: 'water', for: ALL, desc: 'Barrier dome that pops in and shimmers.', spec: {
    w: 64, h: 64, frames: 14, fps: 14, seed: 28, layers: [
      { type: 'ring', x: 32, y: 34, radius: k([[0, 0], [0.3, 24], [1, 24]], 'outBack'), thickness: 1.5, breakup: 0.4, ramp: 'ice' },
      { type: 'ring', x: 32, y: 34, radius: k([[0, 0], [0.3, 19], [1, 19]], 'outBack'), thickness: 4, breakup: 0.8, noiseScale: 0.2, ramp: 'ice', gain: 0.45, blend: 'behind' },
      { type: 'slash', start: 0.3, x: 32, y: 34, radius: 20, angle: -135, arc: 70, thickness: 2.5, squash: 1, progress: ft(0, 1.6), trail: 0.8, ramp: 'white' }
    ], post: OUT } };

  P['level-up'] = { category: 'aura', element: 'gold', for: ALL, desc: 'Gold column and confetti for level/evolve moments.', spec: {
    w: 48, h: 80, frames: 18, fps: 14, seed: 29, pivot: [24, 74], layers: [
      { type: 'flame', x: 24, y: 74, width: 12, height: k([[0, 0], [0.25, 74], [0.8, 74], [1, 0]]), mode: 'pillar', ramp: 'gold', scroll: -3 },
      { type: 'particles', x: 24, y: 72, count: 34, spawn: 0.6, life: 0.7, angle: -90, spread: 60, speed: 120, gravity: 60, size: 1.2, shape: 'square', ramp: 'gold', areaX: 12 }
    ], post: OUT } };

  // ── status loops ────────────────────────────────────────────────────────
  P['status-burn'] = { category: 'status', element: 'fire', for: ALL, desc: 'Small looping flame for burning status.', spec: {
    w: 24, h: 32, frames: 8, fps: 10, loop: true, seed: 30, layers: [{ type: 'flame', x: 12, y: 30, width: 6, height: 22, ramp: 'fire' }], post: OUT } };
  P['status-poison'] = { category: 'status', element: 'poison', for: ALL, desc: 'Bubbling poison icon loop.', spec: {
    w: 24, h: 32, frames: 8, fps: 10, loop: true, seed: 31, layers: [{ type: 'particles', x: 12, y: 28, count: 8, spawn: 1, life: 0.9, angle: -90, spread: 20, speed: 24, size: 1.4, sizeEnd: 2, ramp: 'poison', areaX: 6, hard: 1 }], post: OUT } };
  P['status-stun'] = { category: 'status', element: 'electric', for: ALL, desc: 'Orbiting stars above the head.', spec: {
    w: 32, h: 16, frames: 12, fps: 12, loop: true, seed: 32, layers: [{ type: 'circle', x: 16, y: 8, radius: 12, rings: 1, runes: 3, star: 0, spin: 360, squash: 0.35, ramp: 'gold' }], post: OUT } };

  // ── cutscenes (160x90 = 16:9, scale x4/x8 for 640x360 / 1280x720) ───────
  P['cutscene-ultimate'] = { category: 'cutscene', element: 'fire', for: ALL, desc: 'Anime ultimate cut-in: speed lines, hero silhouette, title, impact frame, slash.', spec: {
    w: 160, h: 90, frames: 40, fps: 16, seed: 40, shake: k([[0, 0], [0.62, 0], [0.64, 4], [0.8, 1], [1, 0]]), layers: [
      { type: 'bg', top: '#1a0a14', bottom: '#5c0a14', bands: 6 },
      { type: 'speedlines', x: 80, y: 45, count: 60, inner: 34, length: 70, ramp: 'fire', bright: 0.7 },
      { type: 'cutin', end: 0.62, y: 48, height: k([[0, 0], [0.15, 40], [0.85, 40], [1, 0]], 'outCubic'), angle: -10, ramp: 'hero', bright: 0.4 },
      { type: 'figure', end: 0.62, x: 34, y: 72, height: 52, pose: 'cast', weapon: 'sword', slide: ft(-70, 0, 'outCubic', 0, 0.25), ramp: 'ink', cut: 0.01, dither: 0 },
      { type: 'text', start: 0.18, end: 0.62, text: 'BLAZING EDGE', x: 108, y: 38, scale: 2, color: '#fff4b0', outline: '#3b0d0d', reveal: ft(0, 1, 'linear', 0, 0.4) },
      { type: 'text', start: 0.3, end: 0.62, text: 'ULTIMATE', x: 108, y: 52, scale: 1, color: '#ff7aa8', outline: '#1a0a14', reveal: ft(0, 1, 'linear', 0, 0.3) },
      { type: 'invert', start: 0.62, end: 0.66 },
      { type: 'effect', start: 0.66, end: 1, preset: 'fire-slash', x: 16, y: -22, scale: 2, speed: 1 },
      { type: 'flash', start: 0.6, end: 0.72, color: '#fff4b0', amount: k([[0, 1], [1, 0]]) },
      { type: 'letterbox', size: k([[0, 0], [0.08, 9], [0.92, 9], [1, 0]], 'outCubic') }
    ], post: [] } };

  P['cutscene-boss-intro'] = { category: 'cutscene', element: 'shadow', for: ALL, desc: 'Boss reveal: letterbox, dark aura rising, name typewriter.', spec: {
    w: 160, h: 90, frames: 44, fps: 14, seed: 41, layers: [
      { type: 'bg', mode: 'radial', top: '#2a0f45', bottom: '#0b0614', x: 80, y: 60, bands: 7 },
      { type: 'flame', x: 80, y: 82, width: 34, height: k([[0, 0], [0.4, 70], [1, 74]], 'outQuad'), ramp: 'shadow', turbulence: 1.1 },
      { type: 'figure', x: 80, y: 82, height: 60, pose: 'guard', weapon: 'spear', facing: 'left', ramp: 'ink', cut: 0.01, dither: 0, cape: 1 },
      { type: 'particles', x: 80, y: 80, count: 40, spawn: 1, life: 0.5, angle: -90, spread: 40, speed: 90, areaX: 40, size: 1, ramp: 'psychic' },
      { type: 'text', start: 0.45, text: 'THE HOLLOW KING', x: 80, y: 20, scale: 2, color: '#b77ae6', outline: '#0b0614', reveal: ft(0, 1, 'linear', 0, 0.5) },
      { type: 'text', start: 0.65, text: 'WARDEN OF THE LAST GATE', x: 80, y: 32, scale: 1, color: '#c8c8d8', outline: '#0b0614', reveal: ft(0, 1, 'linear', 0, 0.5) },
      { type: 'letterbox', size: k([[0, 0], [0.12, 12], [1, 12]], 'outCubic') }
    ], post: [] } };

  P['cutscene-summon'] = { category: 'cutscene', element: 'arcane', for: ['siegelings', 'animevs'], desc: 'Card/creature summon: circle opens, light pillar, flash, name.', spec: {
    w: 160, h: 90, frames: 40, fps: 16, seed: 42, layers: [
      { type: 'bg', top: '#0d0f1a', bottom: '#1b1f36', bands: 5 },
      { type: 'circle', x: 80, y: 74, radius: ft(0, 50, 'outBack', 0, 0.3), rings: 3, runes: 28, star: 7, starStep: 3, squash: 0.3, ramp: 'arcane', bright: 1 },
      { type: 'flame', start: 0.3, x: 80, y: 74, width: 22, height: k([[0, 0], [0.25, 90], [0.75, 90], [1, 0]]), mode: 'pillar', ramp: 'arcane', scroll: -5 },
      { type: 'particles', start: 0.3, x: 80, y: 72, count: 50, spawn: 0.8, life: 0.5, angle: -90, spread: 20, speed: 120, areaX: 20, size: 1, shape: 'square', ramp: 'white' },
      { type: 'flash', start: 0.55, end: 0.68, color: '#d8fbff' },
      { type: 'figure', start: 0.62, x: 80, y: 74, height: 46, pose: 'stand', weapon: 'staff', ramp: 'ink', cut: 0.01, dither: 0 },
      { type: 'text', start: 0.7, text: 'SIEGLING SUMMONED', x: 80, y: 16, scale: 1, color: '#d8fbff', outline: '#140a3a', reveal: ft(0, 1, 'linear', 0, 0.6), wave: 1 }
    ], post: [] } };

  P['cutscene-lineage'] = { category: 'cutscene', element: 'light', for: ['generations'], desc: 'Generational handoff: elder kneels, spirit flame passes to heir.', spec: {
    w: 160, h: 90, frames: 48, fps: 12, seed: 43, layers: [
      { type: 'bg', top: '#1b1f36', bottom: '#5a3d12', bands: 8 },
      { type: 'figure', x: 52, y: 78, height: 44, pose: 'kneel', weapon: 'sword', ramp: 'ink', cut: 0.01, dither: 0, cape: 1 },
      { type: 'figure', x: 112, y: 78, height: 40, pose: 'stand', weapon: 'none', facing: 'left', ramp: 'ink', cut: 0.01, dither: 0, cape: 0 },
      { type: 'orb', start: 0.2, end: 0.8, x0: 54, y0: 48, x1: 110, y1: 52, arcHeight: 18, radius: 3.5, tail: 14, ramp: 'light', travel: ft(0, 1, 'inOutCubic') },
      { type: 'ring', start: 0.78, end: 1, x: 110, y: 56, radius: ft(2, 30, 'outCubic'), thickness: ft(3, 0.5), ramp: 'gold' },
      { type: 'text', start: 0.55, text: 'THE LINE ENDURES', x: 80, y: 14, scale: 2, color: '#ffe59a', outline: '#1b1f36', reveal: ft(0, 1, 'linear', 0, 0.5) },
      { type: 'letterbox', size: 10 }
    ], post: [] } };

  P['cutscene-victory'] = { category: 'cutscene', element: 'gold', for: ALL, desc: 'Victory banner with confetti and rays.', spec: {
    w: 160, h: 90, frames: 32, fps: 14, seed: 44, layers: [
      { type: 'bg', mode: 'radial', top: '#3d2405', bottom: '#0d0f1a', x: 80, y: 45, bands: 6 },
      { type: 'rays', x: 80, y: 45, count: 16, length: 120, inner: 18, width: 8, spin: 40, variance: 0.1, ramp: 'gold', bright: 0.6, gain: 0.7 },
      { type: 'particles', x: 80, y: -4, count: 70, spawn: 0.9, life: 0.7, angle: 90, spread: 60, speed: 40, gravity: 80, areaX: 80, size: 1.2, shape: 'square', ramp: 'hero' },
      { type: 'text', text: 'VICTORY!', x: 80, y: 45, scale: 4, color: '#ffd34d', outline: '#3d2405', reveal: ft(0, 1, 'linear', 0, 0.3), wave: 1 }
    ], post: [] } };

  return P;
});
