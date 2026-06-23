/**
 * Siegelings achievement catalog and client-side unlock evaluation.
 * Unlocks are derived from profile, progression, and match history already on the client.
 */
(function (global) {
    const STATS_KEY = 'sieglingsAchievementStats';

    const LIVE_ELEMENTS = [
        'FIRE', 'EARTH', 'WIND', 'WATER', 'ICE',
        'SHADOW', 'ELECTRIC', 'METAL', 'UNDEAD', 'PSYCHIC'
    ];

    const ELEMENT_LABELS = {
        FIRE: 'Fire', EARTH: 'Earth', WIND: 'Wind', WATER: 'Water', ICE: 'Ice',
        SHADOW: 'Shadow', ELECTRIC: 'Electric', METAL: 'Metal', UNDEAD: 'Undead', PSYCHIC: 'Psychic'
    };

    const CATEGORIES = [
        { id: 'general', label: 'General Goals', eyebrow: 'Campaign', description: 'Wins, streaks, matches, and account milestones.' },
        { id: 'elements', label: 'Elemental Goals', eyebrow: 'Elements', description: 'Master Fire, Ice, Wind, Earth, and cross-element collection.' },
        { id: 'collection', label: 'Card Collection', eyebrow: 'Binder', description: 'Discover cards, rarities, and binder completion.' },
        { id: 'remnants', label: 'Remnants', eyebrow: 'Crafting', description: 'Earn, hoard, and spend Remnants from packs and victories.' },
        { id: 'decks', label: 'Deck Creation', eyebrow: 'Loadouts', description: 'Premade purchases, custom saves, and deck-builder unlocks.' },
        { id: 'loadouts', label: 'Using Decks', eyebrow: 'Arena', description: 'Win with premade, custom, solo, and PVP loadouts.' }
    ];

    const PROFILE_FEATURED_IDS = [
        'first_win',
        'element_specialist',
        'collector_10',
        'deck_builder',
        'win_streak_3',
        'arena_regular'
    ];

    function readStats() {
        try {
            const raw = localStorage.getItem(STATS_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    }

    function writeStats(patch) {
        const next = { ...readStats(), ...patch };
        localStorage.setItem(STATS_KEY, JSON.stringify(next));
        return next;
    }

    function incrementStat(key, amount = 1) {
        const stats = readStats();
        stats[key] = (Number(stats[key]) || 0) + amount;
        writeStats(stats);
        return stats[key];
    }

    function rarityRank(rarity) {
        const order = { COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5 };
        return order[String(rarity || '').toUpperCase()] || 0;
    }

    function tier(id, category, title, description, icon, threshold, valueFn) {
        return {
            id,
            category,
            title,
            description,
            icon,
            threshold,
            progress: ctx => valueFn(ctx),
            check: ctx => valueFn(ctx) >= threshold
        };
    }

    // Resolve a normalized progress snapshot for an evaluated achievement.
    // Returns { current, target, pct, measurable } so the UI can draw a bar or
    // fall back to a plain Unlocked/Locked status for binary/custom checks.
    function progressFor(achievement, ctx) {
        const target = Number(achievement?.threshold);
        const hasProgress = typeof achievement?.progress === 'function' && Number.isFinite(target) && target > 0;
        if (!hasProgress) {
            const unlocked = ctx ? Boolean(achievement?.check?.(ctx)) : Boolean(achievement?.unlocked);
            return { measurable: false, current: unlocked ? 1 : 0, target: 1, pct: unlocked ? 100 : 0 };
        }
        const raw = Number(achievement.progress(ctx)) || 0;
        const current = Math.max(0, raw);
        const pct = Math.max(0, Math.min(100, Math.round((current / target) * 100)));
        return { measurable: true, current, target, pct };
    }

    function buildContext(state, view, helpers = {}) {
        const progression = state.progression || {};
        const profile = state.profile || {};
        const ownedCards = progression.ownedCards || {};
        const ownedEntries = Object.entries(ownedCards).filter(([, count]) => Number(count) > 0);
        const catalog = state.options?.cardCatalog || [];
        const findCard = helpers.findCard || (() => null);
        const ownedModels = ownedEntries.map(([id, count]) => ({
            id,
            count: Number(count || 0),
            card: findCard(id)
        })).filter(row => row.card);
        const elementUnique = {};
        const elementCopies = {};
        const elementWins = {};
        const rarityUnique = { COMMON: 0, UNCOMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 };
        const typeUnique = { SIEGLING: 0, SPELL: 0, TRAP: 0, TRAINER: 0 };
        let maxRarity = 0;
        let maxCopyCount = 0;
        let tripleCopyCards = 0;
        ownedModels.forEach(({ card, count }) => {
            const element = String(card.element || '').toUpperCase();
            const rarity = String(card.rarity || 'COMMON').toUpperCase();
            const type = String(card.type || '').toUpperCase();
            elementUnique[element] = (elementUnique[element] || 0) + 1;
            elementCopies[element] = (elementCopies[element] || 0) + count;
            if (rarityUnique[rarity] !== undefined) rarityUnique[rarity] += 1;
            if (typeUnique[type] !== undefined) typeUnique[type] += 1;
            maxRarity = Math.max(maxRarity, rarityRank(card.rarity));
            maxCopyCount = Math.max(maxCopyCount, count);
            if (count >= 3) tripleCopyCards += 1;
        });
        const battles = view?.battles || (profile.matchHistory || []).map((row, index) => (
            helpers.normalizeBattle ? helpers.normalizeBattle(row, view?.prefs?.favoriteElement || 'Fire', index) : row
        ));
        const record = view?.record || (helpers.battleRecord ? helpers.battleRecord(battles) : {});
        battles.forEach(battle => {
            if (battle.result !== 'WIN') return;
            const el = String(battle.element || '').toUpperCase();
            if (!el) return;
            elementWins[el] = (elementWins[el] || 0) + 1;
        });
        const savedDecks = profile.savedDecks || [];
        const customDecks = savedDecks.filter(deck => deck.custom);
        const customNames = new Set(customDecks.map(deck => String(deck.name || '').trim().toLowerCase()).filter(Boolean));
        const purchasedDeckIds = progression.purchasedDeckIds || [];
        const packHistory = progression.packHistory || [];
        const stats = readStats();
        const wins = record.wins || 0;
        const losses = record.losses || 0;
        const totalMatches = record.total || battles.length;
        const winRate = totalMatches ? Math.round((wins / totalMatches) * 100) : 0;
        const pvpBattles = battles.filter(b => (
            String(b.opponentType || '').toLowerCase() === 'player'
            || String(b.matchType || '').toUpperCase().includes('PVP')
        ));
        const pvpWins = pvpBattles.filter(b => b.result === 'WIN').length;
        const soloWins = battles.filter(b => b.result === 'WIN' && (
            String(b.opponentType || '').toLowerCase() !== 'player'
            && !String(b.matchType || '').toUpperCase().includes('PVP')
        )).length;
        const customWins = battles.filter(b => {
            if (b.result !== 'WIN') return false;
            const label = String(b.deckUsed || '').trim().toLowerCase();
            return customNames.has(label) || label.includes('custom');
        }).length;
        const premadeWins = battles.filter(b => {
            if (b.result !== 'WIN') return false;
            const label = String(b.deckUsed || '').trim().toLowerCase();
            if (customNames.has(label) || label.includes('custom')) return false;
            return label.length > 0;
        }).length;
        const favoriteElement = String(view?.prefs?.favoriteElement || 'Fire').toUpperCase();
        const favoriteElementWins = elementWins[favoriteElement] || 0;
        const missions = state.dailyMissions?.missions || [];
        const missionsClaimed = missions.filter(m => m.claimed).length;
        const missionsCompleted = missions.filter(m => m.completed).length;
        const friendCount = profile.friends?.length || 0;
        const prefs = view?.prefs || {};

        return {
            progression,
            profile,
            view,
            ownedTotal: progression.ownedTotal || ownedEntries.reduce((sum, [, c]) => sum + Number(c || 0), 0),
            uniqueOwned: ownedEntries.length,
            catalogSize: catalog.length || 1,
            completionPct: view?.collection?.completion ?? 0,
            maxRarity,
            maxCopyCount,
            tripleCopyCards,
            elementUnique,
            elementCopies,
            elementWins,
            elementCount: Object.keys(elementUnique).length,
            mostCollectedElementCopies: Math.max(0, ...Object.values(elementCopies)),
            rarityUnique,
            typeUnique,
            record,
            battles,
            wins,
            losses,
            winRate,
            totalMatches,
            bestStreak: record.bestStreak || 0,
            savedDecks,
            customDecks,
            purchasedDeckIds,
            packOpens: packHistory.length,
            remnants: Number(progression.remnants) || 0,
            gold: Number(progression.gold) || 0,
            customDeckUnlocked: Boolean(progression.customDeckUnlocked),
            starterChosen: Boolean(progression.starterChosen),
            soloWinStreak: Number(progression.soloWinStreak) || 0,
            onlineWinStreak: Number(progression.onlineWinStreak) || 0,
            pvpWins,
            pvpMatches: pvpBattles.length,
            soloWins,
            customWins,
            premadeWins,
            favoriteElement,
            favoriteElementWins,
            missionsClaimed,
            missionsCompleted,
            crafts: Number(progression.craftCount ?? stats.crafts) || 0,
            friendCount,
            purchasedOffers: (progression.purchasedDailyOfferIds || []).length,
            prefs,
            avatarElement: String(prefs.avatarMode || '').toUpperCase() === 'ELEMENT',
            hasAvatarUrl: Boolean(String(prefs.avatarUrl || '').trim()),
            hasFavoriteSiegling: Boolean(String(prefs.favoriteSieglingId || prefs.favoriteSiegling || '').trim()),
            trainerDeckCount: customDecks.filter(d => d.trainerId).length
        };
    }

    function elementCollectionBadges() {
        const rows = [];
        LIVE_ELEMENTS.forEach(element => {
            const label = ELEMENT_LABELS[element] || element;
            const key = element.toLowerCase();
            rows.push(
                tier(`${key}_spark`, 'elements', `${label} Spark`, `Own your first unique ${label} card.`, label.slice(0, 1), 1, c => c.elementUnique[element] || 0),
                tier(`${key}_adept`, 'elements', `${label} Adept`, `Own 5 unique ${label} cards.`, label.slice(0, 1), 5, c => c.elementUnique[element] || 0),
                tier(`${key}_master`, 'elements', `${label} Master`, `Own 10 unique ${label} cards.`, '✦', 10, c => c.elementUnique[element] || 0),
                tier(`${key}_victor`, 'elements', `${label} Victor`, `Win 3 matches with a ${label} loadout.`, '⚑', 3, c => c.elementWins[element] || 0)
            );
        });
        return rows;
    }

    const CATALOG = [
        // —— General ——
        tier('first_win', 'general', 'First Win', 'Win your first recorded match.', '★', 1, c => c.wins),
        tier('duelist', 'general', 'Duelist', 'Play 10 matches.', '⚔', 10, c => c.totalMatches),
        tier('brawler', 'general', 'Brawler', 'Play 25 matches.', '⚔', 25, c => c.totalMatches),
        tier('veteran', 'general', 'Arena Veteran', 'Play 50 matches.', '◎', 50, c => c.totalMatches),
        tier('war_journal', 'general', 'War Journal', 'Play 100 matches.', '◎', 100, c => c.totalMatches),
        tier('eternal_duelist', 'general', 'Eternal Duelist', 'Play 200 matches.', '∞', 200, c => c.totalMatches),
        tier('champion', 'general', 'Champion', 'Win 25 matches.', '♛', 25, c => c.wins),
        tier('warlord', 'general', 'Warlord', 'Win 50 matches.', '♛', 50, c => c.wins),
        tier('siege_legend', 'general', 'Siege Legend', 'Win 100 matches.', '♛', 100, c => c.wins),
        tier('win_streak_3', 'general', 'Win Streak', 'Reach a best win streak of 3.', '↗', 3, c => c.bestStreak),
        tier('win_streak_5', 'general', 'Hot Streak', 'Reach a best win streak of 5.', '🔥', 5, c => c.bestStreak),
        tier('win_streak_7', 'general', 'Blazing Run', 'Reach a best win streak of 7.', '🔥', 7, c => c.bestStreak),
        tier('win_streak_10', 'general', 'Unstoppable', 'Reach a best win streak of 10.', '🔥', 10, c => c.bestStreak),
        tier('online_streak_3', 'general', 'Online Heater', 'Reach an online win streak of 3.', '⇈', 3, c => c.onlineWinStreak),
        tier('solo_streak_3', 'general', 'Solo Heater', 'Reach a solo win streak of 3.', '⇈', 3, c => c.soloWinStreak),
        { id: 'tactician', category: 'general', title: 'Tactician', description: 'Maintain 50% win rate over 20+ matches.', icon: '◈', check: c => c.totalMatches >= 20 && c.winRate >= 50 },
        tier('profile_ready', 'general', 'Profile Ready', 'Set a player title and bio on your profile.', '✎', 1, c => (String(c.prefs?.playerTitleId || c.prefs?.playerTitle || '').trim() && String(c.prefs?.bio || '').trim()) ? 1 : 0),
        tier('siegecoin_hoarder', 'general', 'Siegecoin Hoarder', 'Hold 1,000 Siegecoins at once.', '◎', 1000, c => c.gold),
        tier('siegecoin_tycoon', 'general', 'Siegecoin Tycoon', 'Hold 5,000 Siegecoins at once.', '◎', 5000, c => c.gold),
        tier('siegecoin_magnate', 'general', 'Siegecoin Magnate', 'Hold 10,000 Siegecoins at once.', '◎', 10000, c => c.gold),
        tier('mission_claim', 'general', 'Daily Striker', 'Claim a daily mission reward.', '✓', 1, c => c.missionsClaimed),
        tier('mission_habit', 'general', 'Mission Habit', 'Claim 5 daily mission rewards.', '✓', 5, c => c.missionsClaimed),
        tier('mission_master', 'general', 'Mission Master', 'Complete 10 daily missions in a day.', '✓', 10, c => c.missionsCompleted),
        tier('signed_in', 'general', 'Account Linked', 'Sign in and choose a starter pack.', '🔑', 1, c => c.starterChosen ? 1 : 0),
        tier('friend_link', 'general', 'First Ally', 'Add your first friend.', '☺', 1, c => c.friendCount),
        tier('friend_circle', 'general', 'War Council', 'Add 5 friends.', '☺', 5, c => c.friendCount),
        tier('element_avatar', 'general', 'Element Avatar', 'Set your avatar style to favorite element.', '◎', 1, c => c.avatarElement ? 1 : 0),
        tier('portrait_upload', 'general', 'Portrait Uploaded', 'Add a custom avatar image URL.', '🖼', 1, c => c.hasAvatarUrl ? 1 : 0),
        tier('favorite_siegling', 'general', 'Siegeling Fan', 'Set a favorite Siegeling on your profile.', '♥', 1, c => c.hasFavoriteSiegling ? 1 : 0),
        tier('shop_regular', 'general', 'Shop Regular', 'Purchase 3 daily shop offers.', '🛒', 3, c => c.purchasedOffers),

        // —— Elements (cross-element) ——
        tier('element_specialist', 'elements', 'Element Specialist', 'Own 8+ copies from your most-collected element.', '✦', 8, c => c.mostCollectedElementCopies),
        tier('element_hoarder', 'elements', 'Element Hoarder', 'Own 20+ copies from your most-collected element.', '✦', 20, c => c.mostCollectedElementCopies),
        tier('rainbow_binder', 'elements', 'Rainbow Binder', 'Own cards from 4 different elements.', '🌈', 4, c => c.elementCount),
        tier('rainbow_six', 'elements', 'Sixfold Prism', 'Own cards from 6 different elements.', '🌈', 6, c => c.elementCount),
        tier('rainbow_eight', 'elements', 'Eightfold Prism', 'Own cards from 8 different elements.', '🌈', 8, c => c.elementCount),
        tier('rainbow_master', 'elements', 'Prism Master', 'Own cards from all 10 live elements.', '🌈', 10, c => c.elementCount),
        tier('favorite_element_win', 'elements', 'True Allegiance', 'Win 5 matches with your favorite element loadout.', '♥', 5, c => c.favoriteElementWins),
        tier('favorite_element_legend', 'elements', 'Element Loyalist', 'Win 15 matches with your favorite element loadout.', '♥', 15, c => c.favoriteElementWins),
        ...elementCollectionBadges(),

        // —— Collection ——
        tier('collector_10', 'collection', 'Collector', 'Discover 10 unique cards.', '◆', 10, c => c.uniqueOwned),
        tier('collector_25', 'collection', 'Serious Collector', 'Discover 25 unique cards.', '◆', 25, c => c.uniqueOwned),
        tier('collector_50', 'collection', 'Binder Curator', 'Discover 50 unique cards.', '◆', 50, c => c.uniqueOwned),
        tier('collector_75', 'collection', 'Archive Keeper', 'Discover 75 unique cards.', '◆', 75, c => c.uniqueOwned),
        tier('collector_100', 'collection', 'Grand Archivist', 'Discover 100 unique cards.', '◆', 100, c => c.uniqueOwned),
        tier('copy_hoarder', 'collection', 'Copy Hoarder', 'Own 30 total card copies.', '+', 30, c => c.ownedTotal),
        tier('copy_master', 'collection', 'Copy Master', 'Own 60 total card copies.', '+', 60, c => c.ownedTotal),
        tier('copy_barron', 'collection', 'Copy Baron', 'Own 90 total card copies.', '+', 90, c => c.ownedTotal),
        tier('copy_titan', 'collection', 'Copy Titan', 'Own 120 total card copies.', '+', 120, c => c.ownedTotal),
        tier('copy_colossus', 'collection', 'Copy Colossus', 'Own 150 total card copies.', '+', 150, c => c.ownedTotal),
        tier('rare_find', 'collection', 'Rare Find', 'Own at least one Rare card.', 'R', 3, c => c.maxRarity),
        tier('epic_hunter', 'collection', 'Epic Hunter', 'Own at least one Epic card.', 'E', 4, c => c.maxRarity),
        tier('legendary_pull', 'collection', 'Legendary Pull', 'Own at least one Legendary card.', 'L', 5, c => c.maxRarity),
        tier('uncommon_stack', 'collection', 'Uncommon Stack', 'Own 10 unique Uncommon cards.', 'U', 10, c => c.rarityUnique.UNCOMMON),
        tier('rare_stack', 'collection', 'Rare Stack', 'Own 8 unique Rare cards.', 'R', 8, c => c.rarityUnique.RARE),
        tier('epic_stack', 'collection', 'Epic Stack', 'Own 5 unique Epic cards.', 'E', 5, c => c.rarityUnique.EPIC),
        tier('legendary_stack', 'collection', 'Legendary Stack', 'Own 3 unique Legendary cards.', 'L', 3, c => c.rarityUnique.LEGENDARY),
        tier('set_quarter', 'collection', 'Quarter Catalog', 'Reach 25% catalog discovery.', '¼', 25, c => c.completionPct),
        tier('set_half', 'collection', 'Half Catalog', 'Reach 50% catalog discovery.', '½', 50, c => c.completionPct),
        tier('set_three_quarter', 'collection', 'Three-Quarter Catalog', 'Reach 75% catalog discovery.', '¾', 75, c => c.completionPct),
        tier('set_complete', 'collection', 'Catalog Complete', 'Reach 90% catalog discovery.', '★', 90, c => c.completionPct),
        tier('triple_threat', 'collection', 'Triple Threat', 'Own 3 copies of one card.', '3', 3, c => c.maxCopyCount),
        tier('triple_trio', 'collection', 'Triple Trio', 'Max out copies on 3 different cards.', '3', 3, c => c.tripleCopyCards),
        tier('triple_legion', 'collection', 'Triple Legion', 'Max out copies on 10 different cards.', '3', 10, c => c.tripleCopyCards),
        tier('siegling_squad', 'collection', 'Siegeling Squad', 'Own 15 unique Siegeling cards.', 'S', 15, c => c.typeUnique.SIEGLING),
        tier('spell_archive', 'collection', 'Strategy Archive', 'Own 8 unique Strategy cards.', 'P', 8, c => c.typeUnique.SPELL),
        tier('trap_network', 'collection', 'Deception Network', 'Own 8 unique Deception cards.', 'T', 8, c => c.typeUnique.TRAP),
        tier('trainer_belt', 'collection', 'Trainer Belt', 'Own 3 unique Trainer cards.', 'K', 3, c => c.typeUnique.TRAINER),

        // —— Remnants ——
        tier('first_pack', 'remnants', 'Pack Opener', 'Open your first card pack.', '📦', 1, c => c.packOpens),
        tier('pack_regular', 'remnants', 'Pack Regular', 'Open 5 card packs.', '📦', 5, c => c.packOpens),
        tier('pack_veteran', 'remnants', 'Pack Veteran', 'Open 15 card packs.', '📦', 15, c => c.packOpens),
        tier('pack_habit', 'remnants', 'Pack Habit', 'Open 25 card packs.', '📦', 25, c => c.packOpens),
        tier('pack_addict', 'remnants', 'Pack Addict', 'Open 40 card packs.', '📦', 40, c => c.packOpens),
        tier('pack_legend', 'remnants', 'Pack Legend', 'Open 60 card packs.', '📦', 60, c => c.packOpens),
        tier('remnant_pouch', 'remnants', 'Remnant Pouch', 'Hold 100 Remnants at once.', '◇', 100, c => c.remnants),
        tier('remnant_stash', 'remnants', 'Remnant Stash', 'Hold 500 Remnants at once.', '◇', 500, c => c.remnants),
        tier('remnant_vault', 'remnants', 'Remnant Vault', 'Hold 2,000 Remnants at once.', '◈', 2000, c => c.remnants),
        tier('remnant_tycoon', 'remnants', 'Remnant Tycoon', 'Hold 5,000 Remnants at once.', '♦', 5000, c => c.remnants),
        tier('remnant_dynast', 'remnants', 'Remnant Dynast', 'Hold 10,000 Remnants at once.', '♦', 10000, c => c.remnants),
        tier('first_craft', 'remnants', 'Remnant Smith', 'Craft a card from the binder.', '⚒', 1, c => c.crafts),
        tier('master_crafter', 'remnants', 'Master Crafter', 'Craft 5 cards from the binder.', '⚒', 5, c => c.crafts),
        tier('forge_master', 'remnants', 'Forge Master', 'Craft 10 cards from the binder.', '⚒', 10, c => c.crafts),
        tier('grand_forge', 'remnants', 'Grand Forge', 'Craft 25 cards from the binder.', '⚒', 25, c => c.crafts),

        // —— Deck creation ——
        tier('deck_builder', 'decks', 'Deck Builder', 'Save your first custom 30-card deck.', '🃏', 1, c => c.customDecks.length),
        tier('deck_architect', 'decks', 'Deck Architect', 'Save 3 custom decks.', '▤', 3, c => c.customDecks.length),
        tier('deck_curator', 'decks', 'Deck Curator', 'Save 5 custom decks.', '▥', 5, c => c.customDecks.length),
        tier('deck_library', 'decks', 'Deck Library', 'Save 10 custom decks.', '▥', 10, c => c.customDecks.length),
        tier('deck_archive', 'decks', 'Deck Archive', 'Save 15 custom decks.', '▥', 15, c => c.customDecks.length),
        tier('planner_unlock', 'decks', 'Planner Unlocked', 'Unlock save-ready custom decks (30 owned copies).', '🔓', 1, c => c.customDeckUnlocked ? 1 : 0),
        tier('premade_owner', 'decks', 'Premade Owner', 'Purchase a premade deck from the shop.', '🛒', 1, c => c.purchasedDeckIds.length),
        tier('premade_collector', 'decks', 'Premade Collector', 'Purchase 3 premade decks.', '🛍', 3, c => c.purchasedDeckIds.length),
        tier('premade_curator', 'decks', 'Premade Curator', 'Purchase 5 premade decks.', '🛍', 5, c => c.purchasedDeckIds.length),
        tier('premade_arsenal', 'decks', 'Premade Arsenal', 'Purchase 8 premade decks.', '🛍', 8, c => c.purchasedDeckIds.length),
        tier('loadout_shelf', 'decks', 'Loadout Shelf', 'Keep any saved deck on your profile.', '📚', 1, c => c.savedDecks.length),
        tier('loadout_rack', 'decks', 'Loadout Rack', 'Keep 5 saved decks on your profile.', '📚', 5, c => c.savedDecks.length),
        tier('trainer_ready', 'decks', 'Trainer Ready', 'Save a custom deck with a SiegeKnight trainer.', '♞', 1, c => c.trainerDeckCount),
        tier('trainer_corps', 'decks', 'Trainer Corps', 'Save 3 custom decks with trainers.', '♞', 3, c => c.trainerDeckCount),

        // —— Using decks / arena ——
        tier('arena_regular', 'loadouts', 'Arena Regular', 'Win a PVP match against another player.', '⚑', 1, c => c.pvpWins),
        tier('pvp_duelist', 'loadouts', 'PVP Duelist', 'Win 5 PVP matches.', '⚑', 5, c => c.pvpWins),
        tier('pvp_veteran', 'loadouts', 'PVP Veteran', 'Win 15 PVP matches.', '⚑', 15, c => c.pvpWins),
        tier('pvp_champion', 'loadouts', 'PVP Champion', 'Win 30 PVP matches.', '⚑', 30, c => c.pvpWins),
        tier('pvp_warlord', 'loadouts', 'PVP Warlord', 'Win 50 PVP matches.', '⚑', 50, c => c.pvpWins),
        tier('lobby_runner', 'loadouts', 'Lobby Runner', 'Play 10 PVP matches.', '⚑', 10, c => c.pvpMatches),
        tier('solo_striker', 'loadouts', 'Solo Striker', 'Win 5 solo matches.', '🤖', 5, c => c.soloWins),
        tier('solo_veteran', 'loadouts', 'Solo Veteran', 'Win 15 solo matches.', '🤖', 15, c => c.soloWins),
        tier('solo_master', 'loadouts', 'Solo Master', 'Win 30 solo matches.', '🤖', 30, c => c.soloWins),
        tier('premade_victory', 'loadouts', 'Premade Victory', 'Win a match with a premade or shop deck loadout.', '✓', 1, c => c.premadeWins),
        tier('premade_master', 'loadouts', 'Premade Master', 'Win 10 matches with premade loadouts.', '✓', 10, c => c.premadeWins),
        tier('premade_legend', 'loadouts', 'Premade Legend', 'Win 25 matches with premade loadouts.', '✓', 25, c => c.premadeWins),
        tier('custom_victory', 'loadouts', 'Custom Victory', 'Win a match with a saved custom deck.', '★', 1, c => c.customWins),
        tier('custom_master', 'loadouts', 'Custom Master', 'Win 10 matches with custom decks.', '★', 10, c => c.customWins),
        tier('custom_legend', 'loadouts', 'Custom Legend', 'Win 25 matches with custom decks.', '★', 25, c => c.customWins),
        tier('arena_grinder', 'loadouts', 'Arena Grinder', 'Win 20 matches of any type.', '◎', 20, c => c.wins),
        tier('arena_commander', 'loadouts', 'Arena Commander', 'Win 75 matches of any type.', '◎', 75, c => c.wins),
        tier('arena_sovereign', 'loadouts', 'Arena Sovereign', 'Win 150 matches of any type.', '◎', 150, c => c.wins)
    ];

    const catalogDeduped = CATALOG;

    function evaluateAll(state, view, helpers) {
        const ctx = buildContext(state, view, helpers);
        const evaluated = catalogDeduped.map(def => {
            const snap = progressFor(def, ctx);
            return {
                ...def,
                unlocked: Boolean(def.check(ctx)),
                progressCurrent: snap.current,
                progressTarget: snap.target,
                progressPct: snap.pct,
                measurable: snap.measurable
            };
        });
        const unlocked = evaluated.filter(a => a.unlocked);
        const byCategory = {};
        CATEGORIES.forEach(cat => {
            byCategory[cat.id] = evaluated.filter(a => a.category === cat.id);
        });
        const featured = PROFILE_FEATURED_IDS
            .map(id => evaluated.find(a => a.id === id))
            .filter(Boolean);
        return {
            ctx,
            all: evaluated,
            unlocked,
            locked: evaluated.filter(a => !a.unlocked),
            byCategory,
            featured,
            total: evaluated.length,
            unlockedCount: unlocked.length
        };
    }

    function achievementById(id) {
        return catalogDeduped.find(a => a.id === id);
    }

    function categoryMeta(id) {
        return CATEGORIES.find(c => c.id === id) || CATEGORIES[0];
    }

    global.SiegelingsAchievements = {
        CATEGORIES,
        CATALOG: catalogDeduped,
        PROFILE_FEATURED_IDS,
        buildContext,
        evaluateAll,
        progressFor,
        achievementById,
        categoryMeta,
        incrementStat,
        readStats,
        STATS_KEY
    };
})(typeof window !== 'undefined' ? window : globalThis);
