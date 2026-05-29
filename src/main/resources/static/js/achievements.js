/**
 * Siegelings achievement catalog and client-side unlock evaluation.
 * Unlocks are derived from profile, progression, and match history already on the client.
 */
(function (global) {
    const STATS_KEY = 'sieglingsAchievementStats';

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
        let maxRarity = 0;
        ownedModels.forEach(({ card, count }) => {
            const element = String(card.element || '').toUpperCase();
            elementUnique[element] = (elementUnique[element] || 0) + 1;
            elementCopies[element] = (elementCopies[element] || 0) + count;
            maxRarity = Math.max(maxRarity, rarityRank(card.rarity));
        });
        const battles = view?.battles || (profile.matchHistory || []).map((row, index) => (
            helpers.normalizeBattle ? helpers.normalizeBattle(row, view?.prefs?.favoriteElement || 'Fire', index) : row
        ));
        const record = view?.record || (helpers.battleRecord ? helpers.battleRecord(battles) : {});
        const savedDecks = profile.savedDecks || [];
        const customDecks = savedDecks.filter(deck => deck.custom);
        const customNames = new Set(customDecks.map(deck => String(deck.name || '').trim().toLowerCase()).filter(Boolean));
        const purchasedDeckIds = progression.purchasedDeckIds || [];
        const packHistory = progression.packHistory || [];
        const stats = readStats();
        const pvpWins = battles.filter(b => b.result === 'WIN' && (
            String(b.opponentType || '').toLowerCase() === 'player'
            || String(b.matchType || '').toUpperCase().includes('PVP')
        )).length;
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
        const favoriteElementWins = battles.filter(b => b.result === 'WIN' && String(b.element || '').toUpperCase() === favoriteElement).length;
        const missions = state.dailyMissions?.missions || [];
        const missionsClaimed = missions.filter(m => m.claimed).length;

        return {
            progression,
            profile,
            view,
            ownedTotal: progression.ownedTotal || ownedEntries.reduce((sum, [, c]) => sum + Number(c || 0), 0),
            uniqueOwned: ownedEntries.length,
            catalogSize: catalog.length || 1,
            completionPct: view?.collection?.completion ?? 0,
            maxRarity,
            elementUnique,
            elementCopies,
            elementCount: Object.keys(elementUnique).length,
            mostCollectedElementCopies: Math.max(0, ...Object.values(elementCopies)),
            record,
            battles,
            wins: record.wins || 0,
            totalMatches: record.total || battles.length,
            bestStreak: record.bestStreak || 0,
            savedDecks,
            customDecks,
            purchasedDeckIds,
            packOpens: packHistory.length,
            remnants: Number(progression.remnants) || 0,
            gold: Number(progression.gold) || 0,
            customDeckUnlocked: Boolean(progression.customDeckUnlocked),
            starterChosen: Boolean(progression.starterChosen),
            pvpWins,
            soloWins,
            customWins,
            premadeWins,
            favoriteElementWins,
            missionsClaimed,
            crafts: Number(stats.crafts) || 0,
            prefs: view?.prefs || {}
        };
    }

    const CATALOG = [
        // —— General ——
        { id: 'first_win', category: 'general', title: 'First Win', description: 'Win your first recorded match.', icon: '★', check: c => c.wins >= 1 },
        { id: 'duelist', category: 'general', title: 'Duelist', description: 'Play 10 matches.', icon: '⚔', check: c => c.totalMatches >= 10 },
        { id: 'veteran', category: 'general', title: 'Arena Veteran', description: 'Play 50 matches.', icon: '◎', check: c => c.totalMatches >= 50 },
        { id: 'champion', category: 'general', title: 'Champion', description: 'Win 25 matches.', icon: '♛', check: c => c.wins >= 25 },
        { id: 'win_streak_3', category: 'general', title: 'Win Streak', description: 'Reach a best win streak of 3.', icon: '↗', check: c => c.bestStreak >= 3 },
        { id: 'win_streak_5', category: 'general', title: 'Hot Streak', description: 'Reach a best win streak of 5.', icon: '🔥', check: c => c.bestStreak >= 5 },
        { id: 'profile_ready', category: 'general', title: 'Profile Ready', description: 'Set a player title and bio on your profile.', icon: '✎', check: c => Boolean(String(c.prefs?.playerTitle || '').trim() && String(c.prefs?.bio || '').trim()) },
        { id: 'siegecoin_hoarder', category: 'general', title: 'Siegecoin Hoarder', description: 'Hold 1,000 Siegecoins at once.', icon: '◎', check: c => c.gold >= 1000 },
        { id: 'mission_claim', category: 'general', title: 'Daily Striker', description: 'Claim a daily mission reward.', icon: '✓', check: c => c.missionsClaimed >= 1 },
        { id: 'signed_in', category: 'general', title: 'Account Linked', description: 'Sign in and choose a starter pack.', icon: '🔑', check: c => c.starterChosen },

        // —— Elements ——
        { id: 'element_specialist', category: 'elements', title: 'Element Specialist', description: 'Own 8+ copies from your most-collected element.', icon: '✦', check: c => c.mostCollectedElementCopies >= 8 },
        { id: 'rainbow_binder', category: 'elements', title: 'Rainbow Binder', description: 'Own cards from 4 different elements.', icon: '🌈', check: c => c.elementCount >= 4 },
        { id: 'fire_adept', category: 'elements', title: 'Fire Adept', description: 'Own 5 unique Fire cards.', icon: 'F', check: c => (c.elementUnique.FIRE || 0) >= 5 },
        { id: 'ice_adept', category: 'elements', title: 'Ice Adept', description: 'Own 5 unique Ice cards.', icon: 'I', check: c => (c.elementUnique.ICE || 0) >= 5 },
        { id: 'wind_adept', category: 'elements', title: 'Wind Adept', description: 'Own 5 unique Wind cards.', icon: 'W', check: c => (c.elementUnique.WIND || 0) >= 5 },
        { id: 'earth_adept', category: 'elements', title: 'Earth Adept', description: 'Own 5 unique Earth cards.', icon: 'E', check: c => (c.elementUnique.EARTH || 0) >= 5 },
        { id: 'water_adept', category: 'elements', title: 'Water Adept', description: 'Own 5 unique Water cards.', icon: '≋', check: c => (c.elementUnique.WATER || 0) >= 5 },
        { id: 'favorite_element_win', category: 'elements', title: 'True Allegiance', description: 'Win 5 matches with your favorite element loadout.', icon: '♥', check: c => c.favoriteElementWins >= 5 },
        { id: 'shadow_touch', category: 'elements', title: 'Shadow Touch', description: 'Own 3 unique Shadow cards.', icon: '◐', check: c => (c.elementUnique.SHADOW || 0) >= 3 },
        { id: 'electric_spark', category: 'elements', title: 'Electric Spark', description: 'Own 3 unique Electric cards.', icon: '⚡', check: c => (c.elementUnique.ELECTRIC || 0) >= 3 },

        // —— Collection ——
        { id: 'collector_10', category: 'collection', title: 'Collector', description: 'Discover 10 unique cards.', icon: '◆', check: c => c.uniqueOwned >= 10 },
        { id: 'collector_25', category: 'collection', title: 'Serious Collector', description: 'Discover 25 unique cards.', icon: '◆◆', check: c => c.uniqueOwned >= 25 },
        { id: 'collector_50', category: 'collection', title: 'Binder Curator', description: 'Discover 50 unique cards.', icon: '▣', check: c => c.uniqueOwned >= 50 },
        { id: 'copy_hoarder', category: 'collection', title: 'Copy Hoarder', description: 'Own 30 total card copies.', icon: '+', check: c => c.ownedTotal >= 30 },
        { id: 'copy_master', category: 'collection', title: 'Copy Master', description: 'Own 60 total card copies.', icon: '++', check: c => c.ownedTotal >= 60 },
        { id: 'rare_find', category: 'collection', title: 'Rare Find', description: 'Own at least one Rare card.', icon: 'R', check: c => c.maxRarity >= 3 },
        { id: 'epic_hunter', category: 'collection', title: 'Epic Hunter', description: 'Own at least one Epic card.', icon: 'E', check: c => c.maxRarity >= 4 },
        { id: 'legendary_pull', category: 'collection', title: 'Legendary Pull', description: 'Own at least one Legendary card.', icon: 'L', check: c => c.maxRarity >= 5 },
        { id: 'set_quarter', category: 'collection', title: 'Quarter Catalog', description: 'Reach 25% catalog discovery.', icon: '¼', check: c => c.completionPct >= 25 },
        { id: 'set_half', category: 'collection', title: 'Half Catalog', description: 'Reach 50% catalog discovery.', icon: '½', check: c => c.completionPct >= 50 },

        // —— Remnants ——
        { id: 'first_pack', category: 'remnants', title: 'Pack Opener', description: 'Open your first card pack.', icon: '📦', check: c => c.packOpens >= 1 },
        { id: 'pack_regular', category: 'remnants', title: 'Pack Regular', description: 'Open 5 card packs.', icon: '📦📦', check: c => c.packOpens >= 5 },
        { id: 'pack_veteran', category: 'remnants', title: 'Pack Veteran', description: 'Open 15 card packs.', icon: '☆', check: c => c.packOpens >= 15 },
        { id: 'remnant_stash', category: 'remnants', title: 'Remnant Stash', description: 'Hold 500 Remnants at once.', icon: '◇', check: c => c.remnants >= 500 },
        { id: 'remnant_vault', category: 'remnants', title: 'Remnant Vault', description: 'Hold 2,000 Remnants at once.', icon: '◈', check: c => c.remnants >= 2000 },
        { id: 'remnant_tycoon', category: 'remnants', title: 'Remnant Tycoon', description: 'Hold 5,000 Remnants at once.', icon: '♦', check: c => c.remnants >= 5000 },
        { id: 'first_craft', category: 'remnants', title: 'Remnant Smith', description: 'Craft a card from the binder.', icon: '⚒', check: c => c.crafts >= 1 },
        { id: 'master_crafter', category: 'remnants', title: 'Master Crafter', description: 'Craft 5 cards from the binder.', icon: '⚒⚒', check: c => c.crafts >= 5 },

        // —— Deck creation ——
        { id: 'deck_builder', category: 'decks', title: 'Deck Builder', description: 'Save your first custom 30-card deck.', icon: '🃏', check: c => c.customDecks.length >= 1 },
        { id: 'deck_architect', category: 'decks', title: 'Deck Architect', description: 'Save 3 custom decks.', icon: '▤', check: c => c.customDecks.length >= 3 },
        { id: 'deck_curator', category: 'decks', title: 'Deck Curator', description: 'Save 5 custom decks.', icon: '▥', check: c => c.customDecks.length >= 5 },
        { id: 'planner_unlock', category: 'decks', title: 'Planner Unlocked', description: 'Unlock save-ready custom decks (30 owned copies).', icon: '🔓', check: c => c.customDeckUnlocked },
        { id: 'premade_owner', category: 'decks', title: 'Premade Owner', description: 'Purchase a premade deck from the shop.', icon: '🛒', check: c => c.purchasedDeckIds.length >= 1 },
        { id: 'premade_collector', category: 'decks', title: 'Premade Collector', description: 'Purchase 3 premade decks.', icon: '🛍', check: c => c.purchasedDeckIds.length >= 3 },
        { id: 'loadout_shelf', category: 'decks', title: 'Loadout Shelf', description: 'Keep any saved deck on your profile.', icon: '📚', check: c => c.savedDecks.length >= 1 },
        { id: 'trainer_ready', category: 'decks', title: 'Trainer Ready', description: 'Save a custom deck with a SiegeKnight trainer.', icon: '♞', check: c => c.customDecks.some(d => d.trainerId) },

        // —— Using decks / arena ——
        { id: 'arena_regular', category: 'loadouts', title: 'Arena Regular', description: 'Win a PVP match against another player.', icon: '⚑', check: c => c.pvpWins >= 1 },
        { id: 'pvp_duelist', category: 'loadouts', title: 'PVP Duelist', description: 'Win 5 PVP matches.', icon: '⚑⚑', check: c => c.pvpWins >= 5 },
        { id: 'solo_striker', category: 'loadouts', title: 'Solo Striker', description: 'Win 5 solo matches.', icon: '🤖', check: c => c.soloWins >= 5 },
        { id: 'premade_victory', category: 'loadouts', title: 'Premade Victory', description: 'Win a match with a premade or shop deck loadout.', icon: '✓', check: c => c.premadeWins >= 1 },
        { id: 'premade_master', category: 'loadouts', title: 'Premade Master', description: 'Win 10 matches with premade loadouts.', icon: '✓✓', check: c => c.premadeWins >= 10 },
        { id: 'custom_victory', category: 'loadouts', title: 'Custom Victory', description: 'Win a match with a saved custom deck.', icon: '★', check: c => c.customWins >= 1 },
        { id: 'custom_master', category: 'loadouts', title: 'Custom Master', description: 'Win 10 matches with custom decks.', icon: '★★', check: c => c.customWins >= 10 },
        { id: 'arena_grinder', category: 'loadouts', title: 'Arena Grinder', description: 'Win 20 matches of any type.', icon: '◎', check: c => c.wins >= 20 }
    ];

    function evaluateAll(state, view, helpers) {
        const ctx = buildContext(state, view, helpers);
        const evaluated = CATALOG.map(def => ({
            ...def,
            unlocked: Boolean(def.check(ctx))
        }));
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
        return CATALOG.find(a => a.id === id);
    }

    function categoryMeta(id) {
        return CATEGORIES.find(c => c.id === id) || CATEGORIES[0];
    }

    global.SiegelingsAchievements = {
        CATEGORIES,
        CATALOG,
        PROFILE_FEATURED_IDS,
        buildContext,
        evaluateAll,
        achievementById,
        categoryMeta,
        incrementStat,
        readStats,
        STATS_KEY
    };
})(typeof window !== 'undefined' ? window : globalThis);
