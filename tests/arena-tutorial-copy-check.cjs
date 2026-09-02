const { readFileSync } = require('node:fs');

const arenaSrc = readFileSync('/workspace/src/main/resources/static/js/arena-tutorial.js', 'utf8');
const gameSrc = readFileSync('/workspace/src/main/resources/static/js/game.js', 'utf8');
const playHtml = readFileSync('/workspace/src/main/resources/static/play.html', 'utf8');

const failures = [];
if (!arenaSrc.includes('your</b> elemental energy')) failures.push('missing Strategies energy copy');
if (!arenaSrc.includes('your opponent')) failures.push('missing Deceptions opponent-energy copy');
if (!arenaSrc.includes('Siege Damage')) failures.push('missing Siege Damage title');
if (arenaSrc.includes('bounty damage')) failures.push('still mentions bounty damage');
if (!arenaSrc.includes('t2-draw')) failures.push('missing turn 2 draw step');
if (arenaSrc.includes('Finish the match')) failures.push('still has Finish the match step');
if (!playHtml.includes('trainerAbilityStatus')) failures.push('trainer status element missing from play.html');
if (!gameSrc.includes('trainerAbilityStatus')) failures.push('game.js does not reference trainerAbilityStatus');
if (gameSrc.includes('`${activeDescription} ${availability}`')) failures.push('trainer popup still concatenates active + availability');

if (failures.length) {
  console.error('CHECK FAILED', failures);
  process.exit(1);
}
console.log('arena tutorial copy and trainer popup checks passed');
