'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { _private } = require('./index');

test('infers untyped action cards with a singular ability as spells', () => {
  assert.equal(_private.inferCardType({
    id: 'legacy-spell',
    name: 'Legacy Spell',
    element: 'FIRE',
    rarity: 'COMMON',
    costElement: 'FIRE',
    costAmount: 1,
    ability: ability()
  }), 'SPELL');

  assert.equal(_private.inferCardType({
    id: 'legacy-siegling',
    name: 'Legacy Siegling',
    element: 'FIRE',
    rarity: 'COMMON',
    health: 10,
    ability: ability()
  }), 'SIEGLING');
});

test('empty submitted arrays preserve existing catalog sections', () => {
  assert.deepEqual(
    _private.resolveCardsPayload(
      { cards: [], moves: [] },
      { cards: [{ id: 'existing-card' }], moves: [{ id: 'existing-move' }] }
    ),
    { cards: [{ id: 'existing-card' }], moves: [{ id: 'existing-move' }] }
  );

  assert.deepEqual(
    _private.resolveSimplePayload([], [{ id: 'existing-deck' }], 'decks'),
    [{ id: 'existing-deck' }]
  );

  assert.deepEqual(
    _private.resolveLiveElementsPayload({ elements: [] }, [{ element: 'FIRE', active: true }]),
    [{ element: 'FIRE', active: true }]
  );
});

test('normalizes card art ids and extensions for uploads', () => {
  assert.equal(_private.normalizeCardArtId(' Hurricrane! '), 'hurricrane');
  assert.throws(() => _private.normalizeCardArtId('   '), /valid card id/);
  assert.equal(
    _private.resolveCardArtExtension({ originalname: 'art.PNG', mimetype: 'image/png' }),
    'png'
  );
  assert.equal(
    _private.resolveCardArtExtension({ originalname: 'art.bin', mimetype: 'image/webp' }),
    'webp'
  );
  assert.throws(
    () => _private.resolveCardArtExtension({ originalname: 'art.bin', mimetype: 'application/octet-stream' }),
    /Unsupported image type/
  );
  assert.equal(
    _private.buildCardArtPublicUrl('example.appspot.com', 'cards/hurricrane.png'),
    'https://storage.googleapis.com/example.appspot.com/cards/hurricrane.png'
  );
  assert.equal(
    _private.buildCardArtPublicUrl('example.appspot.com', 'cards/hurricrane.png', 'token-123'),
    'https://firebasestorage.googleapis.com/v0/b/example.appspot.com/o/cards%2Fhurricrane.png?alt=media&token=token-123'
  );
});

test('rejects embedded card art data urls during publish validation', () => {
  const bundle = validBundle();
  bundle.cards[0].cardArtUrl = 'data:image/png;base64,abc';
  bundle.cards[0].cardArtMode = 'REPLACE';
  assert.throws(
    () => _private.validateEditorBundle(bundle),
    /embedded image upload/
  );
});

test('rejects project-relative card art paths during live publish validation', () => {
  const bundle = validBundle();
  bundle.cards[0].cardArtUrl = '/assets/cards/seedling.png';
  bundle.cards[0].cardArtMode = 'REPLACE';
  assert.throws(
    () => _private.validateEditorBundle(bundle),
    /not hosted for the live game/
  );
});

test('validates live publish bundle before writing Firestore', () => {
  assert.doesNotThrow(() => _private.validateEditorBundle(validBundle()));

  const noDecks = validBundle();
  noDecks.decks = [];
  assert.throws(
    () => _private.validateEditorBundle(noDecks),
    /at least one preset deck active/
  );

  const invalidEffect = validBundle();
  invalidEffect.trainers[0].passiveAbility.effectType = 'unsupported_effect';
  assert.throws(
    () => _private.validateEditorBundle(invalidEffect),
    /unsupported effect type/
  );
});

function validBundle() {
  return {
    cards: [{
      type: 'SIEGLING',
      id: 'seedling',
      name: 'Seedling',
      element: 'EARTH',
      rarity: 'COMMON',
      preferredRow: 'FRONT'
    }],
    moves: [],
    decks: [{
      id: 'earth-starter',
      name: 'Earth Starter',
      recommendedTrainerId: 'warden',
      active: true,
      elements: ['EARTH'],
      cardIds: []
    }],
    trainers: [{
      id: 'warden',
      name: 'Warden',
      element: 'EARTH',
      rarity: 'COMMON',
      tier: 'SiegeKnight',
      active: true,
      passiveAbility: { ...ability(), passive: true },
      activeAbility: { ...ability(), passive: false }
    }],
    liveElements: [{ element: 'EARTH', active: true }]
  };
}

function ability() {
  return {
    name: 'Strike',
    targetType: 'SELF',
    effectType: 'damage_boost',
    effectValue: 1,
    passive: false
  };
}
