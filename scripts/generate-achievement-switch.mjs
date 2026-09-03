import fs from 'fs';

const LIVE = ['FIRE', 'ICE', 'EARTH', 'WIND', 'WATER', 'SHADOW', 'ELECTRIC', 'METAL', 'UNDEAD', 'PSYCHIC'];

const cases = [];

function add(id, expr) {
  cases.push(`            case "${id}" -> ${expr};`);
}

// General
add('first_win', 'ctx.wins() >= 1');
add('duelist', 'ctx.totalMatches() >= 10');
add('brawler', 'ctx.totalMatches() >= 25');
add('veteran', 'ctx.totalMatches() >= 50');
add('war_journal', 'ctx.totalMatches() >= 100');
add('eternal_duelist', 'ctx.totalMatches() >= 200');
add('champion', 'ctx.wins() >= 25');
add('warlord', 'ctx.wins() >= 50');
add('siege_legend', 'ctx.wins() >= 100');
add('win_streak_3', 'ctx.bestStreak() >= 3');
add('win_streak_5', 'ctx.bestStreak() >= 5');
add('win_streak_7', 'ctx.bestStreak() >= 7');
add('win_streak_10', 'ctx.bestStreak() >= 10');
add('online_streak_3', 'ctx.onlineWinStreak() >= 3');
add('solo_streak_3', 'ctx.soloWinStreak() >= 3');
add('tactician', 'ctx.totalMatches() >= 20 && ctx.winRate() >= 50');
add('profile_ready', 'ctx.hasProfileTitle() && ctx.hasBio()');
add('siegecoin_hoarder', 'ctx.gold() >= 1000');
add('siegecoin_tycoon', 'ctx.gold() >= 5000');
add('siegecoin_magnate', 'ctx.gold() >= 10000');
add('mission_claim', 'ctx.missionsClaimed() >= 1');
add('mission_habit', 'ctx.missionsClaimed() >= 5');
add('mission_master', 'ctx.missionsCompleted() >= 10');
add('signed_in', 'ctx.starterChosen()');
add('friend_link', 'ctx.friendCount() >= 1');
add('friend_circle', 'ctx.friendCount() >= 5');
add('element_avatar', 'ctx.avatarElement()');
add('portrait_upload', 'ctx.hasAvatarUrl()');
add('favorite_siegling', 'ctx.hasFavoriteSiegling()');
add('shop_regular', 'ctx.purchasedOffers() >= 3');

// Cross-element
add('element_specialist', 'ctx.mostCollectedElementCopies() >= 8');
add('element_hoarder', 'ctx.mostCollectedElementCopies() >= 20');
add('rainbow_binder', 'ctx.elementCount() >= 4');
add('rainbow_six', 'ctx.elementCount() >= 6');
add('rainbow_eight', 'ctx.elementCount() >= 8');
add('rainbow_master', 'ctx.elementCount() >= 10');
add('favorite_element_win', 'ctx.favoriteElementWins() >= 5');
add('favorite_element_legend', 'ctx.favoriteElementWins() >= 15');

LIVE.forEach(el => {
  const k = el.toLowerCase();
  add(`${k}_spark`, `ctx.elementUnique("${el}") >= 1`);
  add(`${k}_adept`, `ctx.elementUnique("${el}") >= 5`);
  add(`${k}_master`, `ctx.elementUnique("${el}") >= 10`);
  add(`${k}_victor`, `ctx.elementWins("${el}") >= 3`);
});

// Collection
add('collector_10', 'ctx.uniqueOwned() >= 10');
add('collector_25', 'ctx.uniqueOwned() >= 25');
add('collector_50', 'ctx.uniqueOwned() >= 50');
add('collector_75', 'ctx.uniqueOwned() >= 75');
add('collector_100', 'ctx.uniqueOwned() >= 100');
add('copy_hoarder', 'ctx.ownedTotal() >= 30');
add('copy_master', 'ctx.ownedTotal() >= 60');
add('copy_barron', 'ctx.ownedTotal() >= 90');
add('copy_titan', 'ctx.ownedTotal() >= 120');
add('copy_colossus', 'ctx.ownedTotal() >= 150');
add('rare_find', 'ctx.maxRarity() >= 3');
add('epic_hunter', 'ctx.maxRarity() >= 4');
add('legendary_pull', 'ctx.maxRarity() >= 5');
add('uncommon_stack', 'ctx.rarityUnique("UNCOMMON") >= 10');
add('rare_stack', 'ctx.rarityUnique("RARE") >= 8');
add('epic_stack', 'ctx.rarityUnique("EPIC") >= 5');
add('legendary_stack', 'ctx.rarityUnique("LEGENDARY") >= 3');
add('set_quarter', 'ctx.completionPct() >= 25');
add('set_half', 'ctx.completionPct() >= 50');
add('set_three_quarter', 'ctx.completionPct() >= 75');
add('set_complete', 'ctx.completionPct() >= 90');
add('triple_threat', 'ctx.maxCopyCount() >= 3');
add('triple_trio', 'ctx.tripleCopyCards() >= 3');
add('triple_legion', 'ctx.tripleCopyCards() >= 10');
add('siegling_squad', 'ctx.typeUnique("SIEGLING") >= 15');
add('spell_archive', 'ctx.typeUnique("SPELL") >= 8');
add('trap_network', 'ctx.typeUnique("TRAP") >= 8');
add('trainer_belt', 'ctx.typeUnique("TRAINER") >= 3');

// Remnants
add('first_pack', 'ctx.packOpens() >= 1');
add('pack_regular', 'ctx.packOpens() >= 5');
add('pack_veteran', 'ctx.packOpens() >= 15');
add('pack_habit', 'ctx.packOpens() >= 25');
add('pack_addict', 'ctx.packOpens() >= 40');
add('pack_legend', 'ctx.packOpens() >= 60');
add('remnant_pouch', 'ctx.remnants() >= 100');
add('remnant_stash', 'ctx.remnants() >= 500');
add('remnant_vault', 'ctx.remnants() >= 2000');
add('remnant_tycoon', 'ctx.remnants() >= 5000');
add('remnant_dynast', 'ctx.remnants() >= 10000');
add('first_craft', 'ctx.crafts() >= 1');
add('master_crafter', 'ctx.crafts() >= 5');
add('forge_master', 'ctx.crafts() >= 10');
add('grand_forge', 'ctx.crafts() >= 25');

// Decks
add('deck_builder', 'ctx.customDecks() >= 1');
add('deck_architect', 'ctx.customDecks() >= 3');
add('deck_curator', 'ctx.customDecks() >= 5');
add('deck_library', 'ctx.customDecks() >= 10');
add('deck_archive', 'ctx.customDecks() >= 15');
add('planner_unlock', 'ctx.customDeckUnlocked()');
add('premade_owner', 'ctx.purchasedDeckIds() >= 1');
add('premade_collector', 'ctx.purchasedDeckIds() >= 3');
add('premade_curator', 'ctx.purchasedDeckIds() >= 5');
add('premade_arsenal', 'ctx.purchasedDeckIds() >= 8');
add('loadout_shelf', 'ctx.savedDecks() >= 1');
add('loadout_rack', 'ctx.savedDecks() >= 5');
add('trainer_ready', 'ctx.trainerDeckCount() >= 1');
add('trainer_corps', 'ctx.trainerDeckCount() >= 3');

// Loadouts
add('arena_regular', 'ctx.pvpWins() >= 1');
add('pvp_duelist', 'ctx.pvpWins() >= 5');
add('pvp_veteran', 'ctx.pvpWins() >= 15');
add('pvp_champion', 'ctx.pvpWins() >= 30');
add('pvp_warlord', 'ctx.pvpWins() >= 50');
add('lobby_runner', 'ctx.pvpMatches() >= 10');
add('solo_striker', 'ctx.soloWins() >= 5');
add('solo_veteran', 'ctx.soloWins() >= 15');
add('solo_master', 'ctx.soloWins() >= 30');
add('premade_victory', 'ctx.premadeWins() >= 1');
add('premade_master', 'ctx.premadeWins() >= 10');
add('premade_legend', 'ctx.premadeWins() >= 25');
add('custom_victory', 'ctx.customWins() >= 1');
add('custom_master', 'ctx.customWins() >= 10');
add('custom_legend', 'ctx.customWins() >= 25');
add('arena_grinder', 'ctx.wins() >= 20');
add('arena_commander', 'ctx.wins() >= 75');
add('arena_sovereign', 'ctx.wins() >= 150');

console.log(`Generated ${cases.length} switch cases`);
fs.writeFileSync('scripts/generated-achievement-switch.txt', cases.join('\n'));
