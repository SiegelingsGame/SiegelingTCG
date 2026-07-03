import fs from 'fs';

const LIVE = ['FIRE', 'ICE', 'WATER', 'EARTH', 'WIND', 'SHADOW', 'ELECTRIC', 'METAL', 'UNDEAD', 'PSYCHIC'];
const LABELS = {
  FIRE: 'Fire', EARTH: 'Earth', WIND: 'Wind', WATER: 'Water', ICE: 'Ice',
  SHADOW: 'Shadow', ELECTRIC: 'Electric', METAL: 'Metal', UNDEAD: 'Undead', PSYCHIC: 'Psychic'
};

const s = fs.readFileSync('src/main/resources/static/js/achievements.js', 'utf8');
const block = s.match(/const CATALOG = \[([\s\S]*?)\];/)[1];
const entries = [];
for (const m of block.matchAll(/tier\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']*)'/g)) {
  entries.push({ id: m[1], badge: m[3], desc: m[4] });
}
for (const m of block.matchAll(/\{\s*id:\s*'([^']+)',\s*category:\s*'([^']+)',\s*title:\s*'([^']+)',\s*description:\s*'([^']*)'/g)) {
  entries.push({ id: m[1], badge: m[3], desc: m[4] });
}
LIVE.forEach(el => {
  const k = el.toLowerCase();
  const lab = LABELS[el];
  entries.push({ id: `${k}_spark`, badge: `${lab} Spark`, desc: `Own first ${lab} card` });
  entries.push({ id: `${k}_adept`, badge: `${lab} Adept`, desc: `Own 5 unique ${lab}` });
  entries.push({ id: `${k}_master`, badge: `${lab} Master`, desc: `Own 10 unique ${lab}` });
  entries.push({ id: `${k}_victor`, badge: `${lab} Victor`, desc: `Win 3 with ${lab}` });
});

const CUSTOM = {
  first_win: 'First Victor of the Arena',
  duelist: 'Ten-Match Challenger',
  brawler: 'Seasoned Brawler',
  veteran: 'Arena Veteran Captain',
  war_journal: 'War Journal Chronicler',
  eternal_duelist: 'Eternal Arena Wanderer',
  champion: 'Siege Court Champion',
  warlord: 'Banner Warlord',
  siege_legend: 'Legend of the Siege',
  win_streak_3: 'Threefold Streak Knight',
  win_streak_5: 'Fivefold Flame Runner',
  win_streak_7: 'Sevenfold Momentum Lord',
  win_streak_10: 'Unstoppable Siege Lord',
  online_streak_3: 'Online Heater Prime',
  solo_streak_3: 'Solo Campaign Heater',
  tactician: 'Half-Rate Strategist',
  profile_ready: 'Profile Forged Duelist',
  siegecoin_hoarder: 'Siegecoin Hoarder',
  siegecoin_tycoon: 'Siegecoin Tycoon',
  siegecoin_magnate: 'Siegecoin Magnate',
  mission_claim: 'Daily Striker',
  mission_habit: 'Mission Habit Keeper',
  mission_master: 'Mission Master of the Day',
  signed_in: 'Account-Bound Duelist',
  friend_link: 'First Ally Herald',
  friend_circle: 'War Council Speaker',
  element_avatar: 'Element Avatar',
  portrait_upload: 'Portrait Bearer',
  favorite_siegling: 'Siegeling Devotee',
  shop_regular: 'Shop Regular Patron',
  element_specialist: 'Element Specialist',
  element_hoarder: 'Element Hoarder',
  rainbow_binder: 'Rainbow Binder',
  rainbow_six: 'Sixfold Prism Keeper',
  rainbow_eight: 'Eightfold Prism Keeper',
  rainbow_master: 'Prism Master Sovereign',
  favorite_element_win: 'True Allegiance',
  favorite_element_legend: 'Element Loyalist Exalted',
  collector_10: 'Novice Collector',
  collector_25: 'Serious Collector Lord',
  collector_50: 'Binder Curator Supreme',
  collector_75: 'Archive Keeper Regent',
  collector_100: 'Grand Archivist Prime',
  copy_hoarder: 'Copy Hoarder Baron',
  copy_master: 'Copy Master Magnate',
  copy_barron: 'Copy Baron Sovereign',
  copy_titan: 'Copy Titan Warden',
  copy_colossus: 'Copy Colossus Paragon',
  rare_find: 'Rare Find Scout',
  epic_hunter: 'Epic Hunter Pursuer',
  legendary_pull: 'Legendary Pull Seeker',
  uncommon_stack: 'Uncommon Stack Curator',
  rare_stack: 'Rare Stack Curator',
  epic_stack: 'Epic Stack Curator',
  legendary_stack: 'Legendary Stack Curator',
  set_quarter: 'Quarter Catalog Scholar',
  set_half: 'Half Catalog Scholar',
  set_three_quarter: 'Three-Quarter Catalog Scholar',
  set_complete: 'Catalog Complete Paragon',
  triple_threat: 'Triple Threat Duelist',
  triple_trio: 'Triple Trio Commander',
  triple_legion: 'Triple Legion Marshal',
  siegling_squad: 'Siegeling Squad Captain',
  spell_archive: 'Spell Archive Keeper',
  trap_network: 'Trap Network Architect',
  trainer_belt: 'Trainer Belt Champion',
  first_pack: 'First Pack Ripper',
  pack_regular: 'Pack Regular Enthusiast',
  pack_veteran: 'Pack Veteran Opener',
  pack_habit: 'Pack Habit Devotee',
  pack_addict: 'Pack Addict Extraordinaire',
  pack_legend: 'Pack Legend Unleashed',
  remnant_pouch: 'Remnant Pouch Bearer',
  remnant_stash: 'Remnant Stash Keeper',
  remnant_vault: 'Remnant Vault Warden',
  remnant_tycoon: 'Remnant Tycoon Magnate',
  remnant_dynast: 'Remnant Dynast Sovereign',
  first_craft: 'Remnant Smith Initiate',
  master_crafter: 'Master Crafter Artificer',
  forge_master: 'Forge Master Artisan',
  grand_forge: 'Grand Forge Legend',
  deck_builder: 'Deck Builder Pioneer',
  deck_architect: 'Deck Architect Savant',
  deck_curator: 'Deck Curator Maestro',
  deck_library: 'Deck Library Custodian',
  deck_archive: 'Deck Archive Curator',
  planner_unlock: 'Planner Unlocked Strategist',
  premade_owner: 'Premade Owner Patron',
  premade_collector: 'Premade Collector Lord',
  premade_curator: 'Premade Curator Exalted',
  premade_arsenal: 'Premade Arsenal Commander',
  loadout_shelf: 'Loadout Shelf Keeper',
  loadout_rack: 'Loadout Rack Marshal',
  trainer_ready: 'Trainer Ready Commander',
  trainer_corps: 'Trainer Corps General',
  arena_regular: 'Arena Regular Gladiator',
  pvp_duelist: 'PVP Duelist Captain',
  pvp_veteran: 'PVP Veteran Warlord',
  pvp_champion: 'PVP Champion Exalted',
  pvp_warlord: 'PVP Warlord Sovereign',
  lobby_runner: 'Lobby Runner Scout',
  solo_striker: 'Solo Striker Captain',
  solo_veteran: 'Solo Veteran Commander',
  solo_master: 'Solo Master Paragon',
  premade_victory: 'Premade Victory Herald',
  premade_master: 'Premade Master Strategist',
  premade_legend: 'Premade Legend Exalted',
  custom_victory: 'Custom Victory Innovator',
  custom_master: 'Custom Master Architect',
  custom_legend: 'Custom Legend Forgemaster',
  arena_grinder: 'Arena Grinder Veteran',
  arena_commander: 'Arena Commander Supreme',
  arena_sovereign: 'Arena Sovereign Eternal'
};

function titleLabel(e) {
  if (CUSTOM[e.id]) return CUSTOM[e.id];
  const em = e.id.match(/^(fire|earth|wind|water|ice|shadow|electric|metal|undead|psychic)_(spark|adept|master|victor)$/);
  if (em) {
    const lab = LABELS[em[1].toUpperCase()];
    return ({
      spark: `${lab} Spark Initiate`,
      adept: `${lab} Adept`,
      master: `${lab} Archon`,
      victor: `${lab} Victor`
    })[em[2]];
  }
  return `${e.badge} Exemplar`;
}

const out = entries.map(e => ({
  achievementId: e.id,
  titleId: `title_ach_${e.id}`,
  label: titleLabel(e),
  description: `Earned by unlocking the "${e.badge}" achievement.`
}));

const seen = new Set();
out.forEach(t => {
  if (seen.has(t.label)) t.label = `${t.label} (${t.achievementId.replace(/_/g, ' ')})`;
  seen.add(t.label);
});

fs.mkdirSync('src/main/resources/catalog', { recursive: true });
fs.writeFileSync('src/main/resources/catalog/achievement-titles.json', JSON.stringify(out, null, 2));
console.log('Wrote', out.length, 'achievement titles');
