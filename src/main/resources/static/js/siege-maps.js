/* Siege battle-map catalog — segment pools + boss arenas.
   Each id has a static landscape + portrait SVG composition. Selection and
   orientation-aware loading live in adventure.js. */
window.SIEGE_MAPS = {
  bySegment: [
    ['muster-field', 'ash-road'],
    ['moat-crossing', 'rampart-breach'],
    ['keep-hall', 'umbral-vault']
  ],
  boss: ['tourney-yard', 'gatehouse', 'throne-of-the-siegelord']
};
