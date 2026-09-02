const { readFileSync } = require('node:fs');

const arenaSrc = readFileSync('/workspace/src/main/resources/static/js/arena-tutorial.js', 'utf8');
const playHtml = readFileSync('/workspace/src/main/resources/static/play.html', 'utf8');

const failures = [];
if (!arenaSrc.includes('Strategies</b> cast on your turn')) failures.push('missing short Strategies copy');
if (!arenaSrc.includes('Deceptions</b> play like Strategies')) failures.push('missing Deceptions play-like-Strategies copy');
if (arenaSrc.includes('face-down')) failures.push('still says face-down');
if (!arenaSrc.includes('t2-deception')) failures.push('Deceptions not moved to turn 2');
if (!arenaSrc.includes('⚪ Common')) failures.push('missing Common white rarity');
if (!arenaSrc.includes('Siege Damage')) failures.push('missing Siege Damage');
if (arenaSrc.includes('bounty damage')) failures.push('still mentions bounty damage');
if (!arenaSrc.includes('t2-battle')) failures.push('missing battle 2 step');
if (!arenaSrc.includes('t2-evolve')) failures.push('missing evolution step');
if (!arenaSrc.includes('t2-claim')) failures.push('missing claim step');
if (!arenaSrc.includes('Status & badges')) failures.push('missing status/badges step');
if (!arenaSrc.includes('Reach a socket')) failures.push('missing shortened socket title');
if (arenaSrc.includes('call well')) failures.push('socket tip still overshares call-well jargon');
if (!playHtml.includes('arena-tutorial.js?v=5')) failures.push('cache pin not bumped to v=5');

if (failures.length) {
  console.error('CHECK FAILED', failures);
  process.exit(1);
}
console.log('arena tutorial simplify checks passed');
