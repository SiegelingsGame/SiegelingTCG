/*
 * Siege animated sprite registry, shared by the Siege battle (adventure.js) and
 * the hub's card sheet (home-redesign.js, Siege tab). One copy of the numbers:
 * a sheet re-cut by tools/sprites/slice-*.py changes here only.
 */
(function () {
  'use strict';
  // w/h: the shared cell; fit: how much of the cell's height the idle body
  // fills (the cell also holds raised swords and attack effects), so every
  // sheet renders its body at the same size; base: share of the cell below the
  // feet (petals lying on the ground), sunk below the floor so the feet meet
  // the shadow; frames: strip length per pose. slice-*.py prints all of these.
  var sheets = {
    squirebud: { dir: '/img/sprites/squirebud/squirebud-', w: 642, h: 337, fit: 0.82, base: 0.018,
      frames: { idle: 4, walk: 4, attack: 4, cheer: 4, hurt: 4, fainted: 4 } },
    floraknight: { dir: '/img/sprites/floraknight/floraknight-', w: 526, h: 264, fit: 0.667, base: 0.091,
      frames: { idle: 7, walk: 9, attack: 7, cheer: 4, hurt: 3, fainted: 2 } },
    generoot: { dir: '/img/sprites/generoot/generoot-', w: 518, h: 258, fit: 0.678, base: 0.027,
      frames: { idle: 8, walk: 9, attack: 6, cheer: 4, hurt: 3, fainted: 2 } },
    sundile: { dir: '/img/sprites/sundile/sundile-', w: 552, h: 224, fit: 0.723, base: 0.027,
      frames: { idle: 9, walk: 9, attack: 8, cheer: 4, hurt: 3, fainted: 2 } },
    raydile: { dir: '/img/sprites/raydile/raydile-', w: 348, h: 153, fit: 0.941, base: 0.033,
      frames: { idle: 8, walk: 8, attack: 6, cheer: 4, hurt: 3, fainted: 2 } },
    solgator: { dir: '/img/sprites/solgator/solgator-', w: 460, h: 242, fit: 0.814, base: 0.037,
      frames: { idle: 8, walk: 8, attack: 6, cheer: 4, hurt: 3, fainted: 2 } },
    cacty: { dir: '/img/sprites/cacty/cacty-', w: 480, h: 250, fit: 0.696, base: 0.032,
      frames: { idle: 9, walk: 9, attack: 6, cheer: 4, hurt: 3, fainted: 2 } },
    jackedty: { dir: '/img/sprites/jackedty/jackedty-', w: 352, h: 219, fit: 0.744, base: 0.027,
      frames: { idle: 9, walk: 9, attack: 7, cheer: 4, hurt: 3, fainted: 2 } },
    cactyjackedty: { dir: '/img/sprites/cactyjackedty/cactyjackedty-', w: 374, h: 235, fit: 0.681, base: 0.03,
      frames: { idle: 9, walk: 9, attack: 6, cheer: 4, hurt: 3, fainted: 2 } },
    breezee: { dir: '/img/sprites/breezee/breezee-', w: 640, h: 252, fit: 0.512, base: 0.119,
      frames: { idle: 9, walk: 8, attack: 6, cheer: 4, hurt: 3, fainted: 2 } },
    gagglestand: { dir: '/img/sprites/gagglestand/gagglestand-', w: 340, h: 270, fit: 0.663, base: 0.115,
      frames: { idle: 9, walk: 9, attack: 7, cheer: 4, hurt: 3, fainted: 2 } },
    hurricrane: { dir: '/img/sprites/hurricrane/hurricrane-', w: 496, h: 276, fit: 0.623, base: 0.029,
      frames: { idle: 9, walk: 9, attack: 4, cheer: 4, hurt: 3, fainted: 2 } },
    fawny: { dir: '/img/sprites/fawny/fawny-', w: 266, h: 207, fit: 0.831, base: 0.024,
      frames: { idle: 8, walk: 8, attack: 4, cheer: 4, hurt: 3, fainted: 2 } },
    chilldoe: { dir: '/img/sprites/chilldoe/chilldoe-', w: 302, h: 221, fit: 0.869, base: 0.032,
      frames: { idle: 8, walk: 8, attack: 7, cheer: 3, hurt: 3, fainted: 2 } },
    frostag: { dir: '/img/sprites/frostag/frostag-', w: 366, h: 240, fit: 0.817, base: 0.025,
      frames: { idle: 8, walk: 8, attack: 7, cheer: 4, hurt: 3, fainted: 2 } }
  };
  // displayCardId -> ANIM_SPRITES key, for Siegelings whose sheets have shipped.
  var cards = { squirebud: 'squirebud', floraknight: 'floraknight', generoot: 'generoot',
    sundile: 'sundile', raydile: 'raydile', solgator: 'solgator',
    cacty: 'cacty', jackedty: 'jackedty', cactyjackedty: 'cactyjackedty',
    breezee: 'breezee', gagglestand: 'gagglestand', hurricrane: 'hurricrane',
    fawny: 'fawny', chilldoe: 'chilldoe', frostag: 'frostag' };
  window.SiegeSprites = {
    sheets: sheets,
    cards: cards,
    poses: ['idle', 'walk', 'attack', 'cheer', 'hurt', 'fainted'],
    /** The sheet for a card id, or null when it has no animated sprite yet. */
    forCard: function (id) { return id && cards[id] ? sheets[cards[id]] : null; }
  };
})();
