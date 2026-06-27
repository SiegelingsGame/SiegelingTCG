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

test('normalizes loading art uploads for stable Storage object paths', () => {
  assert.equal(_private.normalizeLoadingArtPieceId(' Ember Hollow Landscape! '), 'ember-hollow');
  assert.throws(() => _private.normalizeLoadingArtPieceId('   '), /Give the art piece a name/);
  assert.equal(_private.normalizeLoadingArtOrientation(' Portrait '), 'portrait');
  assert.throws(() => _private.normalizeLoadingArtOrientation('square'), /landscape or portrait/);
  assert.equal(
    _private.resolveLoadingArtExtension({ originalname: 'piece.JPEG', mimetype: 'image/jpeg' }),
    'jpg'
  );
  assert.equal(
    _private.resolveLoadingArtExtension({ originalname: 'piece.bin', mimetype: 'image/webp' }),
    'webp'
  );
  assert.throws(
    () => _private.resolveLoadingArtExtension({ originalname: 'piece.svg', mimetype: 'image/svg+xml' }),
    /Loading art must/
  );
});

test('groups loading art Storage objects into gallery entries', () => {
  const grouped = _private.groupLoadingArtEntries([
    {
      filename: 'ember-hollow-landscape.png',
      url: _private.buildStoragePublicUrl('example.firebasestorage.app', 'img/art/loading/ember-hollow-landscape.png', 'land-token')
    },
    {
      filename: 'ember-hollow-portrait.webp',
      url: _private.buildStoragePublicUrl('example.firebasestorage.app', 'img/art/loading/ember-hollow-portrait.webp', 'port-token')
    },
    {
      filename: 'bad.txt',
      url: 'https://example.invalid/bad.txt'
    }
  ]);

  assert.deepEqual(grouped, [{
    id: 'ember-hollow',
    title: 'Ember Hollow',
    landscape: 'https://firebasestorage.googleapis.com/v0/b/example.firebasestorage.app/o/img%2Fart%2Floading%2Fember-hollow-landscape.png?alt=media&token=land-token',
    portrait: 'https://firebasestorage.googleapis.com/v0/b/example.firebasestorage.app/o/img%2Fart%2Floading%2Fember-hollow-portrait.webp?alt=media&token=port-token'
  }]);
});

test('only accepts top-level loading art Storage objects', () => {
  assert.equal(
    _private.loadingArtFilenameFromObjectPath('img/art/loading/ember-hollow-landscape.png'),
    'ember-hollow-landscape.png'
  );
  assert.equal(_private.loadingArtFilenameFromObjectPath('img/art/loading/nested/file.png'), null);
  assert.equal(_private.loadingArtFilenameFromObjectPath('assets/cards/sundile.png'), null);
  assert.deepEqual(
    _private.parseLoadingArtFilename('apple-grove-portrait.webp'),
    { id: 'apple-grove', orientation: 'portrait' }
  );
});

test('injects the Squire Bob fallback trainer when Firestore omits him', () => {
  const stored = [{
    id: 'warden',
    name: 'Warden',
    element: 'EARTH',
    rarity: 'COMMON',
    tier: 'SiegeKnight',
    active: true
  }];
  const result = _private.withSquireBobFallback(stored);
  assert.equal(result.length, 2);
  assert.equal(result[result.length - 1].id, 'squire-bob');
  assert.equal(result[result.length - 1].element, 'NEUTRAL');

  // Handles a missing/non-array trainers field too.
  const fromEmpty = _private.withSquireBobFallback(undefined);
  assert.deepEqual(fromEmpty, [_private.DEFAULT_SQUIRE_BOB_TRAINER]);
});

test('does not duplicate Squire Bob when Firestore already stores him', () => {
  const stored = [{ id: 'Squire-Bob', name: 'Squire Bob (edited)', element: 'NEUTRAL', tier: 'SiegeSquire' }];
  const result = _private.withSquireBobFallback(stored);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Squire Bob (edited)');
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
