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
  assert.equal(_private.normalizeCardArtVariant('holographic'), 'HOLOGRAPHIC');
  assert.equal(_private.normalizeCardArtVariant('anything-else'), 'STANDARD');
  assert.equal(_private.buildCardArtObjectPath('bearby', 'png', 'STANDARD'), 'cards/bearby.png');
  assert.equal(_private.buildCardArtObjectPath('bearby', 'png', 'HOLOGRAPHIC'), 'cards/bearby-holographic.png');
});

test('parses multipart card-art uploads from a buffered Cloud Functions body', async () => {
  // Firebase Functions (gen2) hand Express the body as `req.rawBody` after the
  // stream is already consumed, which is what broke the old multer-based
  // upload. Feeding that buffer to the busboy parser must still yield the
  // fields and file bytes.
  const boundary = '----cardArtTestBoundary';
  const fileBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
  const rawBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="cardId"\r\n\r\ntrainer10\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="art.png"\r\nContent-Type: image/png\r\n\r\n`),
    fileBytes,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const req = {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    rawBody
  };

  const { fields, file } = await _private.parseCardArtUpload(req);
  assert.equal(fields.cardId, 'trainer10');
  assert.equal(file.originalname, 'art.png');
  assert.equal(file.mimetype, 'image/png');
  assert.deepEqual(file.buffer, fileBytes);
  assert.equal(_private.resolveCardArtExtension(file), 'png');
});

test('rejects non-multipart card-art uploads', async () => {
  await assert.rejects(
    () => _private.parseCardArtUpload({ headers: { 'content-type': 'application/json' }, rawBody: Buffer.from('{}') }),
    /multipart\/form-data/
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

test('validates holographic full-card art independently from standard Siege art', () => {
  const valid = validBundle();
  valid.cards[0].cardArtUrl = 'https://cdn.example/seedling-overlay.png';
  valid.cards[0].cardArtMode = 'OVERLAY';
  valid.cards[0].holographicCardArtUrl = 'https://cdn.example/seedling-holographic.png';
  valid.cards[0].holographicCardArtScale = 1.18;
  assert.doesNotThrow(() => _private.validateEditorBundle(valid));

  const invalid = validBundle();
  invalid.cards[0].holographicCardArtUrl = 'data:image/png;base64,abc';
  assert.throws(() => _private.validateEditorBundle(invalid), /holographicCardArtUrl uses an embedded image upload/);

  const invalidScale = validBundle();
  invalidScale.cards[0].holographicCardArtUrl = 'https://cdn.example/seedling-holographic.png';
  invalidScale.cards[0].holographicCardArtScale = 4;
  assert.throws(() => _private.validateEditorBundle(invalidScale), /holographicCardArtScale must be between 0.25 and 3/);
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
