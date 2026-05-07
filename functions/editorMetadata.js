'use strict';

const EFFECT_TYPES = [
  {
    key: 'damage',
    label: 'Damage',
    description: 'Deals damage to the resolved target or targets.',
    targetHints: ['SINGLE_ENEMY', 'ROW_ENEMIES', 'ROW_SELECT_ENEMIES', 'ALL_ENEMIES', 'ENEMY_PLAYER']
  },
  {
    key: 'player_damage',
    label: 'Player Damage',
    description: 'Deals direct damage to the opposing player.',
    targetHints: ['ENEMY_PLAYER']
  },
  {
    key: 'heal',
    label: 'Heal',
    description: "Restores health up to the target's max health.",
    targetHints: ['SINGLE_ALLY', 'ALL_ALLIES', 'ROW_ALLIES', 'ROW_SELECT_ALLIES', 'SELF']
  },
  {
    key: 'freeze',
    label: 'Freeze',
    description: 'Applies the freeze status.',
    targetHints: ['SINGLE_ENEMY', 'ROW_ENEMIES', 'ROW_SELECT_ENEMIES', 'ALL_ENEMIES']
  },
  {
    key: 'speed_zero',
    label: 'Speed Zero',
    description: 'Sets effective Speed to 0 for the turn.',
    targetHints: ['SINGLE_ENEMY', 'ROW_ENEMIES', 'ROW_SELECT_ENEMIES', 'ALL_ENEMIES']
  },
  {
    key: 'damage_boost',
    label: 'Damage Boost',
    description: 'Adds temporary attack damage.',
    targetHints: ['SINGLE_ALLY', 'ALL_ALLIES', 'ROW_ALLIES', 'ROW_SELECT_ALLIES', 'PASSIVE']
  },
  {
    key: 'health_boost',
    label: 'Health Boost',
    description: 'Adds temporary max health and heals by the same amount.',
    targetHints: ['SINGLE_ALLY', 'ALL_ALLIES', 'ROW_ALLIES', 'ROW_SELECT_ALLIES', 'PASSIVE']
  },
  {
    key: 'connected_allies_damage_boost',
    label: 'Connected Allies Damage Boost',
    description: 'Buffs every allied Siegling connected to the source card through active links.',
    targetHints: ['SELF']
  },
  {
    key: 'connected_allies_health_boost',
    label: 'Connected Allies Health Boost',
    description: 'Gives connected allied Sieglings extra max health.',
    targetHints: ['SELF']
  },
  {
    key: 'speed_boost',
    label: 'Speed Boost',
    description: 'Adds temporary speed.',
    targetHints: ['SINGLE_ALLY', 'ALL_ALLIES', 'ROW_ALLIES', 'ROW_SELECT_ALLIES', 'PASSIVE']
  },
  {
    key: 'connected_allies_speed_boost',
    label: 'Connected Allies Speed Boost',
    description: 'Gives connected allied Sieglings extra speed.',
    targetHints: ['SELF']
  },
  {
    key: 'destroy',
    label: 'Destroy',
    description: 'Defeats the resolved target immediately.',
    targetHints: ['SINGLE_ENEMY', 'ROW_SELECT_ENEMIES']
  },
  {
    key: 'move_link',
    label: 'Move Link',
    description: 'Moves the source card to an open linked point.',
    targetHints: ['SELF']
  }
];

const TARGET_RULES = {
  SINGLE_ENEMY: {
    requiresRow: false,
    fixedTargetCount: 1,
    helperText: 'Pick one enemy.'
  },
  ALL_ENEMIES: {
    requiresRow: false,
    fixedTargetCount: 0,
    helperText: 'Hits every enemy, so no extra target fields are needed.'
  },
  ROW_ENEMIES: {
    requiresRow: true,
    fixedTargetCount: 0,
    helperText: 'Choose which enemy row the ability hits.'
  },
  SINGLE_ALLY: {
    requiresRow: false,
    fixedTargetCount: 1,
    helperText: 'Pick one ally.'
  },
  ALL_ALLIES: {
    requiresRow: false,
    fixedTargetCount: 0,
    helperText: 'Affects every ally, so no target count is needed.'
  },
  ROW_ALLIES: {
    requiresRow: true,
    fixedTargetCount: 0,
    helperText: 'Choose which allied row the ability affects.'
  },
  ROW_SELECT_ENEMIES: {
    requiresRow: false,
    fixedTargetCount: 0,
    helperText: 'Player selects which enemy row to hit at battle time. No pre-set row needed.'
  },
  ROW_SELECT_ALLIES: {
    requiresRow: false,
    fixedTargetCount: 0,
    helperText: 'Player selects which allied row to affect at battle time. No pre-set row needed.'
  },
  ENEMY_PLAYER: {
    requiresRow: false,
    fixedTargetCount: 0,
    helperText: 'Targets the opposing player directly.'
  },
  SELF: {
    requiresRow: false,
    fixedTargetCount: 0,
    helperText: 'The card affects itself.'
  },
  PASSIVE: {
    requiresRow: false,
    fixedTargetCount: 0,
    helperText: 'Always active with no manual targeting.'
  }
};

function buildMetadata(trainers) {
  return {
    elements: ['FIRE', 'EARTH', 'WIND', 'WATER', 'ICE', 'SHADOW', 'ELECTRIC', 'METAL', 'UNDEAD', 'PSYCHIC', 'POISON', 'LIGHT', 'NEUTRAL'],
    cardTypes: ['SIEGLING', 'SPELL', 'TRAP'],
    rarities: ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'],
    rows: ['BACK', 'MIDDLE', 'FRONT'],
    targetTypes: ['SINGLE_ENEMY', 'ALL_ENEMIES', 'ROW_ENEMIES', 'SINGLE_ALLY', 'ALL_ALLIES', 'ROW_ALLIES', 'ROW_SELECT_ENEMIES', 'ROW_SELECT_ALLIES', 'ENEMY_PLAYER', 'SELF', 'PASSIVE'],
    notchDirections: ['TOP', 'TOP_RIGHT', 'RIGHT', 'BOTTOM_RIGHT', 'BOTTOM', 'BOTTOM_LEFT', 'LEFT', 'TOP_LEFT'],
    reactions: ['MIST'],
    trainers: Array.isArray(trainers) ? trainers.map((trainer) => ({
      id: String(trainer?.id || '').trim(),
      name: String(trainer?.name || '').trim(),
      element: trainer?.element || null,
      rarity: trainer?.rarity || null,
      tier: trainer?.tier || 'SiegeKnight',
      active: trainer?.active !== false,
      oncePerGame: Boolean(trainer?.oncePerGame)
    })) : [],
    deckRules: {
      minDeckSize: 30,
      maxCopies: 3,
      recommendedPresetSize: 40
    },
    effectTypes: EFFECT_TYPES,
    targetRules: TARGET_RULES,
    moveCategories: ['STANDARD', 'SPECIALITY', 'UTILITY']
  };
}

module.exports = {
  buildMetadata
};
