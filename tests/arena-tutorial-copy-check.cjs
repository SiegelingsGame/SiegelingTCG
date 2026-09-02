const { readFileSync } = require('node:fs');

const arenaSrc = readFileSync('/workspace/src/main/resources/static/js/arena-tutorial.js', 'utf8');
const coachSrc = readFileSync('/workspace/src/main/resources/static/js/coach.js', 'utf8');
const playHtml = readFileSync('/workspace/src/main/resources/static/play.html', 'utf8');
const gameSrc = readFileSync('/workspace/src/main/java/com/sieglings/service/GameService.java', 'utf8');

const failures = [];
if (!arenaSrc.includes('Advanced Tutorial')) failures.push('missing Advanced Tutorial offer');
if (!arenaSrc.includes('buildAdvancedSteps')) failures.push('missing advanced steps builder');
if (!arenaSrc.includes('Ashen Ward')) failures.push('advanced steps missing shield lesson');
if (!arenaSrc.includes('Elemental afflictions')) failures.push('missing affliction lesson');
if (!arenaSrc.includes('altLabel')) failures.push('finale missing altLabel');
if (!coachSrc.includes('continueWith')) failures.push('coach missing continueWith');
if (!coachSrc.includes('tut-alt')) failures.push('coach missing alt button');
if (!coachSrc.includes('onAlt')) failures.push('coach missing onAlt');
if (!gameSrc.includes('tutorial_ashen_ward')) failures.push('deck missing Ashen Ward injection');
if (!gameSrc.includes('spell_fire_09')) failures.push('deck missing damage-boost Strategy');
if (!gameSrc.includes('spell_earth_02')) failures.push('deck missing health-boost Strategy');
if (!playHtml.includes('arena-tutorial.js?v=7')) failures.push('arena-tutorial pin not v=7');
if (!playHtml.includes('coach.js?v=3')) failures.push('coach.js pin not v=3');
if (!playHtml.includes('game.js?v=258')) failures.push('game.js pin not v=258');
if (!arenaSrc.includes('scripted')) failures.push('mulligan tip missing scripted copy');
if (!arenaSrc.includes('Pylook')) failures.push('mulligan tip missing Pylook practice card');
if (!gameSrc.includes('TUTORIAL_SCRIPTED_MULLIGAN_INDEX')) failures.push('missing scripted mulligan index');
if (!gameSrc.includes('ensureTutorialLessonOpeningHand')) failures.push('missing lesson-hand restore');
if (arenaSrc.includes('face-down')) failures.push('still says face-down');

if (failures.length) {
  console.error('CHECK FAILED', failures);
  process.exit(1);
}
console.log('advanced tutorial checks passed');
