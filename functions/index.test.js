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
