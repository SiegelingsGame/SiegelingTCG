package com.sieglings.campaign;

import com.sieglings.adventure.CampaignWildSupport;
import com.sieglings.adventure.SiegeLand;
import com.sieglings.campaign.CampaignRun.ArenaKind;
import com.sieglings.campaign.CampaignRun.Phase;
import com.sieglings.model.Card;
import com.sieglings.model.GameState;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.SpellCard;
import com.sieglings.model.TrainerCard;
import com.sieglings.model.TrapCard;
import com.sieglings.model.enums.Element;
import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.service.CardDefinitionService;
import com.sieglings.service.GameService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.sieglings.model.CardInstance;
import com.sieglings.model.enums.Rarity;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;

@Service
public class CampaignService {

    private static final int STRATEGY_HAND = 4;

    @Autowired private CardDefinitionService cardDefs;
    @Autowired private GameService gameService;
    @Autowired private CampaignWildSupport wildSupport;
    @Autowired private CampaignRunStore store;

    private final Map<String, CampaignRun> runs = new ConcurrentHashMap<>();
    private final SecureRandom tokens = new SecureRandom();
    private volatile Function<Card, Map<String, Object>> clientCardJson;
    private volatile Function<TrainerCard, Map<String, Object>> clientTrainerJson;

    void useClientCardJson(Function<Card, Map<String, Object>> serializer) {
        this.clientCardJson = serializer;
    }

    void useClientTrainerJson(Function<TrainerCard, Map<String, Object>> serializer) {
        this.clientTrainerJson = serializer;
    }

    public Map<String, Object> options(AccountUser user) {
        Map<String, Object> out = new LinkedHashMap<>();
        List<Map<String, Object>> starters = new ArrayList<>();
        for (CampaignContent.Starter s : CampaignContent.STARTERS) {
            Map<String, Object> row = CampaignContent.starterJson(s);
            cardDefs.findCardCopy(s.cardId()).ifPresent(card -> {
                if (clientCardJson != null) row.put("card", clientCardJson.apply(card));
                row.put("artUrl", card.getCardArtUrl());
            });
            starters.add(row);
        }
        out.put("starters", starters);
        out.put("squireId", CampaignContent.SQUIRE_ID);
        out.put("ralliesToUnlockAkhar", CampaignContent.RALLIES_TO_UNLOCK_AKHAR);
        return out;
    }

    public Optional<String> latestRunToken(AccountUser user) {
        if (user == null || user.getId() == null) return Optional.empty();
        return store.latestTokenFor(user.getId()).filter(t -> {
            try {
                view(t);
                return true;
            } catch (Exception e) {
                return false;
            }
        });
    }

    public CampaignRun start(AccountUser user, String starterId, String playerName) {
        CampaignContent.Starter starter = CampaignContent.starterById(starterId);
        if (starter == null) {
            throw new IllegalArgumentException("Pick Sundile, Cacty, Fawny, or Breezee.");
        }
        if (cardDefs.findCardCopy(starter.cardId()).isEmpty()) {
            throw new IllegalArgumentException("Starter card is missing from the catalog.");
        }
        CampaignRun run = new CampaignRun();
        run.token = newToken();
        run.ownerUserId = user == null || user.getId() == null ? "" : user.getId();
        run.playerName = playerName == null || playerName.isBlank() ? "Squire" : playerName.trim();
        run.starterId = starter.cardId();
        run.starterElement = starter.element().name();
        run.trainerId = CampaignContent.SQUIRE_ID;
        run.roster.add(starter.cardId());
        run.arenaPreset.add(starter.cardId());
        // Cell 7 = row 2, middle column: the front line's center.
        run.presetCells.put(starter.cardId(), 7);
        run.siegeSquad = new ArrayList<>(java.util.Arrays.asList(null, starter.cardId(), null));
        run.followerId = starter.cardId();
        run.seen.add(starter.cardId());
        run.items.add("oak-charm");
        run.area = "sanctuary";
        run.unlockedLandIds.add(starter.landId());
        // Soft-unlock adjacent starter lands so the world map is not a single tile.
        for (CampaignContent.Starter s : CampaignContent.STARTERS) {
            run.unlockedLandIds.add(s.landId());
        }
        run.currentLandId = starter.landId();
        run.phase = Phase.WORLD;
        run.lastMessage = "You set out from the Sanctuary as a Squire with " + starter.name() + ".";
        run.gold = 20;
        journal(run, "story", "Set out from the Sanctuary with " + starter.name() + ". Rally "
                + CampaignContent.RALLIES_TO_UNLOCK_AKHAR + " realms to face Raidlord Akhar.");
        return persist(run);
    }

    public CampaignRun view(String token) {
        CampaignRun run = require(token);
        synchronized (run) {
            settleArenaIfNeeded(run);
            return run;
        }
    }

    public CampaignRun enterLand(String token, String landId) {
        CampaignRun run = require(token);
        synchronized (run) {
            settleArenaIfNeeded(run);
            requirePhase(run, Phase.WORLD, Phase.LAND, Phase.RALLY, Phase.AKHAR_READY);
            SiegeLand land = SiegeLand.byId(landId);
            if (land == null || !"ELEMENTAL".equals(land.kind())) {
                throw new IllegalArgumentException("Unknown Land.");
            }
            if (!run.unlockedLandIds.contains(landId) && !run.ralliedLandIds.contains(landId)) {
                throw new IllegalArgumentException(land.name() + " is still sealed.");
            }
            run.currentLandId = landId;
            run.phase = Phase.LAND;
            run.area = landId;
            run.lastMessage = "You enter " + land.name() + ".";
            return persist(run);
        }
    }

    public CampaignRun setPreset(String token, List<String> cardIds) {
        return setPreset(token, cardIds, null);
    }

    /**
     * Saves the Arena party (at most {@link CampaignRun#ARENA_PARTY_MAX}) and where each
     * stands. Requested cells pass through the battle's own opening-placement rules, so
     * the saved cells are where the units will really stand.
     */
    public CampaignRun setPreset(String token, List<String> cardIds, Map<String, Integer> cells) {
        CampaignRun run = require(token);
        synchronized (run) {
            if (cardIds == null || cardIds.isEmpty()) {
                throw new IllegalArgumentException("Pick at least one Siegeling for your Arena preset.");
            }
            List<String> clean = new ArrayList<>();
            for (String id : cardIds) {
                if (id == null || id.isBlank()) continue;
                if (!run.roster.contains(id)) {
                    throw new IllegalArgumentException(id + " is not in your campaign roster.");
                }
                if (!clean.contains(id)) clean.add(id);
                if (clean.size() >= CampaignRun.ARENA_PARTY_MAX) break;
            }
            if (clean.isEmpty()) throw new IllegalArgumentException("Pick at least one Siegeling.");
            Map<String, Integer> wanted = new LinkedHashMap<>();
            Set<Integer> taken = new LinkedHashSet<>();
            for (String id : clean) {
                Integer cell = cells == null ? null : cells.get(id);
                if (cell == null) cell = run.presetCells.get(id);
                if (cell == null || cell < 0 || cell > 8 || taken.contains(cell)) cell = firstFreeCell(taken);
                taken.add(cell);
                wanted.put(id, cell);
            }
            run.arenaPreset = clean;
            run.presetCells = resolveCells(clean, wanted);
            run.lastMessage = "Arena party set (" + clean.size() + ").";
            return persist(run);
        }
    }

    private static int firstFreeCell(Set<Integer> taken) {
        for (int[] slot : CampaignContent.PLAYER_SLOTS) {
            int cell = slot[0] * 3 + slot[1];
            if (!taken.contains(cell)) return cell;
        }
        for (int c = 0; c < 9; c++) if (!taken.contains(c)) return c;
        return 0;
    }

    /** Runs the preset through the battle's opening placement; keeps requested cells that are legal. */
    private Map<String, Integer> resolveCells(List<String> ids, Map<String, Integer> wanted) {
        List<GameService.GauntletPlacement> board = new ArrayList<>();
        for (String id : ids) {
            Card card = cardDefs.findCardCopy(id).orElse(null);
            if (!(card instanceof SieglingCard siegling)) continue;
            int cell = wanted.getOrDefault(id, 1);
            board.add(new GameService.GauntletPlacement(siegling, cell / 3, cell % 3));
        }
        Map<String, Integer> out = new LinkedHashMap<>();
        List<Map.Entry<String, int[]>> placed = gameService.previewCampaignBoard(board);
        if (placed == null || placed.isEmpty()) {
            out.putAll(wanted);
            return out;
        }
        for (Map.Entry<String, int[]> e : placed) {
            out.put(e.getKey(), e.getValue()[0] * 3 + e.getValue()[1]);
        }
        for (String id : ids) out.putIfAbsent(id, wanted.get(id));
        return out;
    }

    /** Where Bob is walking, so a battle sends him back to the same place. */
    public CampaignRun setArea(String token, String area) {
        CampaignRun run = require(token);
        synchronized (run) {
            String clean = area == null ? "" : area.trim().toLowerCase();
            if (!clean.equals("sanctuary") && !clean.equals("wildlands") && SiegeLand.byId(clean) == null) {
                throw new IllegalArgumentException("Unknown area.");
            }
            run.area = clean;
            // Leaving a Land for the Sanctuary or the Wildlands puts the run back on the world map.
            if (SiegeLand.byId(clean) == null && (run.phase == Phase.LAND || run.phase == Phase.RALLY)) {
                run.phase = run.ralliedLandIds.size() >= CampaignContent.RALLIES_TO_UNLOCK_AKHAR
                        ? Phase.AKHAR_READY : Phase.WORLD;
            }
            return persist(run);
        }
    }

    /**
     * SiegeSquad for Siege-mode (wild) battles: three slots, left, center and right.
     * Null or blank leaves a slot empty; a Siegeling can stand in one slot only.
     */
    public CampaignRun setSquad(String token, List<String> slots) {
        CampaignRun run = require(token);
        synchronized (run) {
            List<String> clean = new ArrayList<>();
            for (int i = 0; i < CampaignRun.SIEGE_SQUAD_MAX; i++) {
                String id = slots != null && i < slots.size() ? slots.get(i) : null;
                if (id == null || id.isBlank() || "null".equals(id)) { clean.add(null); continue; }
                if (!run.roster.contains(id)) throw new IllegalArgumentException(id + " is not in your campaign roster.");
                if (clean.contains(id)) throw new IllegalArgumentException(cardName(id) + " can only stand in one slot.");
                clean.add(id);
            }
            if (clean.stream().allMatch(java.util.Objects::isNull)) {
                throw new IllegalArgumentException("Your SiegeSquad needs at least one Siegeling.");
            }
            run.siegeSquad = clean;
            run.lastMessage = "SiegeSquad set.";
            return persist(run);
        }
    }

    /** Which roster Siegeling walks behind Bob in the overworld. */
    public CampaignRun setFollower(String token, String cardId) {
        CampaignRun run = require(token);
        synchronized (run) {
            if (cardId == null || !run.roster.contains(cardId)) {
                throw new IllegalArgumentException("That Siegeling is not in your roster.");
            }
            run.followerId = cardId;
            run.lastMessage = cardName(cardId) + " now follows you.";
            return persist(run);
        }
    }

    /** Hands an item to a roster Siegeling (or takes it back with a null item). */
    public CampaignRun equip(String token, String cardId, String itemId) {
        CampaignRun run = require(token);
        synchronized (run) {
            if (cardId == null || !run.roster.contains(cardId)) {
                throw new IllegalArgumentException("That Siegeling is not in your roster.");
            }
            String held = run.equipped.remove(cardId);
            if (held != null) run.items.add(held);
            if (itemId != null && !itemId.isBlank()) {
                if (!run.items.remove(itemId)) {
                    if (held != null) { run.items.remove(held); run.equipped.put(cardId, held); }
                    throw new IllegalArgumentException("You do not have that item.");
                }
                run.equipped.put(cardId, itemId);
                CampaignItems.Item item = CampaignItems.byId(itemId);
                run.lastMessage = cardName(cardId) + " now holds " + (item == null ? itemId : item.name()) + ".";
            } else {
                run.lastMessage = cardName(cardId) + " holds nothing.";
            }
            return persist(run);
        }
    }

    // ---- Wild (Siege AP) -------------------------------------------------

    public CampaignRun startWild(String token) {
        return startWild(token, null, null);
    }

    /**
     * A Siege-mode wild battle: the SiegeSquad (left, center, right) against a wild pack led
     * by the roamer Bob walked into, from wherever he is walking (a Land or the Wildlands).
     * Winning catches the lead.
     */
    public CampaignRun startWild(String token, String leadCardId, String area) {
        CampaignRun run = require(token);
        synchronized (run) {
            settleArenaIfNeeded(run);
            requirePhase(run, Phase.WORLD, Phase.LAND, Phase.RALLY, Phase.AKHAR_READY);
            String fightArea = area == null || area.isBlank() ? run.area : area.trim().toLowerCase();
            if (leadCardId != null && !leadCardId.isBlank() && !wildPoolIds(run, fightArea).contains(leadCardId)) {
                throw new IllegalArgumentException("That Siegeling does not roam here.");
            }
            SiegeLand land = landFor(run, fightArea, leadCardId);
            if (land == null) throw new IllegalArgumentException("Nothing roams here.");

            TrainerCard squire = cardDefs.getActiveTrainerById(CampaignContent.SQUIRE_ID)
                    .orElseThrow(() -> new IllegalStateException("Squire Bob missing."));
            List<String> partyIds = run.squadInOrder();
            if (partyIds.isEmpty()) {
                List<String> fallback = run.arenaPreset.isEmpty() ? run.roster : run.arenaPreset;
                partyIds = new ArrayList<>(fallback.subList(0, Math.min(CampaignRun.SIEGE_SQUAD_MAX, fallback.size())));
            }
            Random rng = new Random(run.token.hashCode() ^ System.nanoTime());
            CampaignWildSupport.StartResult started = wildSupport.start(run.token, squire, partyIds, land, rng,
                    leadCardId == null || leadCardId.isBlank() ? null : leadCardId);
            run.pendingCaptureCardId = started.captureCardId();
            run.pendingCaptureName = started.captureName();
            run.pendingArenaArea = fightArea;
            if (started.captureCardId() != null) run.seen.add(started.captureCardId());
            run.phase = Phase.WILD_BATTLE;
            run.lastMessage = "A wild " + started.captureName() + " blocks the path!";
            return persist(run);
        }
    }

    /** The Land whose wilds a battle draws on: the area's own, else the lead's element's. */
    private SiegeLand landFor(CampaignRun run, String area, String leadCardId) {
        SiegeLand own = SiegeLand.byId(area);
        if (own != null) return own;
        Element el = leadCardId == null ? null : cardDefs.findCardCopy(leadCardId).map(Card::getElement).orElse(null);
        for (SiegeLand l : CampaignContent.elementalLands()) {
            if (el != null && l.elements().get(0) == el) return l;
        }
        SiegeLand current = SiegeLand.byId(run.currentLandId);
        return current != null ? current : CampaignContent.elementalLands().get(0);
    }

    public Map<String, Object> wildBattle(String token) {
        CampaignRun run = require(token);
        synchronized (run) {
            if (run.phase != Phase.WILD_BATTLE) return Map.of();
            // An interrupted server session can leave a saved Campaign encounter
            // without its in-memory Siege battle. Resolve it as a retreat.
            if (wildSupport.isOver(run.token)) {
                finishWildIfOver(run);
                persist(run);
                return Map.of();
            }
            return wildSupport.battleView(run.token);
        }
    }

    public Map<String, Object> wildPlay(String token, String cardId, String targetId) {
        return applyWildAction(token, () -> wildSupport.play(token, cardId, targetId, new Random(System.nanoTime())));
    }

    public Map<String, Object> wildEndTurn(String token) {
        return applyWildAction(token, () -> wildSupport.endTurn(token, new Random(System.nanoTime())));
    }

    public Map<String, Object> wildUltimate(String token) {
        return applyWildAction(token, () -> wildSupport.useUltimate(token, new Random(System.nanoTime())));
    }

    private Map<String, Object> applyWildAction(String token, Runnable action) {
        CampaignRun run = require(token);
        synchronized (run) {
            if (run.phase != Phase.WILD_BATTLE) return Map.of();
            if (wildSupport.isOver(run.token)) {
                finishWildIfOver(run);
                persist(run);
                return Map.of();
            }
            action.run();
            // Keep the final play and its animations in the response even though
            // the Campaign outcome is committed before the player goes back.
            Map<String, Object> result = wildSupport.battleView(run.token);
            finishWildIfOver(run);
            persist(run);
            return result;
        }
    }

    public CampaignRun finishWild(String token) {
        CampaignRun run = require(token);
        synchronized (run) {
            requirePhase(run, Phase.WILD_BATTLE);
            finishWildIfOver(run);
            if (run.phase == Phase.WILD_BATTLE) {
                throw new IllegalStateException("The wild fight is still going.");
            }
            return persist(run);
        }
    }

    private void finishWildIfOver(CampaignRun run) {
        if (!wildSupport.isOver(run.token)) return;
        if (run.pendingArenaArea != null) run.area = run.pendingArenaArea;
        if (wildSupport.won(run.token)) {
            String captureId = run.pendingCaptureCardId;
            if (captureId != null && cardDefs.findCardCopy(captureId).isPresent() && !run.roster.contains(captureId)) {
                run.roster.add(captureId);
                joinTeams(run, captureId);
                run.lastMessage = "You rallied " + run.pendingCaptureName + " to your cause!";
                journal(run, "capture", "Caught " + cardName(captureId) + ".");
                run.gold += 8;
            } else {
                run.lastMessage = "Victory in the wilds.";
                run.gold += 5;
            }
            gainXp(run, 25);
            Random rng = new Random(System.nanoTime());
            if (rng.nextInt(100) < 30) {
                CampaignItems.Item item = CampaignItems.roll(ArenaKind.WILD, rng);
                run.items.add(item.id());
                run.lastMessage += " Found " + item.name() + ".";
                journal(run, "item", "Found " + item.name() + " (" + item.effectText() + ").");
            }
        } else {
            run.lastMessage = "Your warband was driven back. Rest and try again.";
        }
        run.phase = phaseForArea(run, null);
        wildSupport.clear(run.token);
        run.pendingCaptureCardId = null;
        run.pendingCaptureName = null;
        run.pendingArenaArea = null;
    }

    /** A new catch fills a free SiegeSquad slot and a free ArenaTeam place, if there are any. */
    private void joinTeams(CampaignRun run, String cardId) {
        while (run.siegeSquad.size() < CampaignRun.SIEGE_SQUAD_MAX) run.siegeSquad.add(null);
        int[] order = {1, 0, 2};
        for (int i : order) {
            if (run.siegeSquad.get(i) == null) { run.siegeSquad.set(i, cardId); break; }
        }
        if (run.arenaPreset.size() < CampaignRun.ARENA_PARTY_MAX && !run.arenaPreset.contains(cardId)) {
            run.arenaPreset.add(cardId);
            run.presetCells.put(cardId, firstFreeCell(new LinkedHashSet<>(run.presetCells.values())));
        }
    }

    // ---- Arena (Battle Table) --------------------------------------------

    public String startArena(String token, String kindRaw) {
        return startArena(token, kindRaw, null, null);
    }

    /**
     * Opens a Battle Table match for the campaign. Every kind fields at most
     * {@link CampaignRun#ARENA_PARTY_MAX} Siegelings a side; the player's stand where the
     * preset board put them, under Squire Bob at his current level, holding their items.
     */
    public String startArena(String token, String kindRaw, String wildCardId, String area) {
        CampaignRun run = require(token);
        synchronized (run) {
            settleArenaIfNeeded(run);
            ArenaKind kind = parseKind(kindRaw);
            String fightArea = run.area;
            if (kind == ArenaKind.AKHAR) {
                requirePhase(run, Phase.AKHAR_READY, Phase.WORLD, Phase.LAND, Phase.RALLY);
                if (run.ralliedLandIds.size() < CampaignContent.RALLIES_TO_UNLOCK_AKHAR) {
                    throw new IllegalArgumentException("Rally more kingdoms before challenging Akhar.");
                }
            } else if (kind == ArenaKind.WILD) {
                requirePhase(run, Phase.WORLD, Phase.LAND, Phase.RALLY, Phase.AKHAR_READY);
                fightArea = area == null || area.isBlank() ? run.area : area.trim().toLowerCase();
                if (!wildPoolIds(run, fightArea).contains(wildCardId)) {
                    throw new IllegalArgumentException("That Siegeling does not roam here.");
                }
            } else if (kind == ArenaKind.LEGENDARY) {
                requirePhase(run, Phase.LAND, Phase.RALLY);
                SiegeLand land = SiegeLand.byId(run.currentLandId);
                if (land == null) throw new IllegalArgumentException("Enter a Land first.");
                String el = land.elements().get(0).name().toLowerCase();
                if (run.sigils.contains(el)) {
                    throw new IllegalArgumentException("You already hold the " + land.name() + " Sigil.");
                }
                if (!run.clearedRivalLandIds.contains(land.id())) {
                    throw new IllegalArgumentException("Beat " + land.name() + "'s rival before the shrine opens.");
                }
                fightArea = land.id();
            } else {
                requirePhase(run, Phase.LAND, Phase.RALLY);
                fightArea = run.currentLandId;
            }
            if (run.arenaPreset.isEmpty()) {
                throw new IllegalArgumentException("Set your Arena preset first.");
            }

            int n = Math.min(CampaignRun.ARENA_PARTY_MAX, run.arenaPreset.size());
            List<String> playerIds = new ArrayList<>(run.arenaPreset.subList(0, n));
            List<GameService.GauntletPlacement> playerBoard = presetPlacements(run, playerIds);
            List<Card> playerDeck = strategyDeck(n);

            TrainerCard playerTrainer = cardDefs.getActiveTrainerById(run.trainerId)
                    .map(t -> gameService.leveledTrainer(t, run.level))
                    .orElse(null);

            String landId = kind == ArenaKind.AKHAR || kind == ArenaKind.WILD ? null : run.currentLandId;
            EncounterSpec enemy = kind == ArenaKind.WILD ? wildEncounter(run, fightArea, wildCardId)
                    : kind == ArenaKind.LEGENDARY ? legendaryEncounter(run.currentLandId)
                    : enemyFor(kind, landId, kind == ArenaKind.RIVAL ? Math.min(3, n) : Math.max(3, n),
                            run.ralliedLandIds.size());
            int playerHp = kind == ArenaKind.WILD ? CampaignContent.RIVAL_HP : CampaignContent.playerHpFor(kind);

            GameService.GauntletSide playerSide = new GameService.GauntletSide(
                    run.playerName, playerDeck, playerTrainer, playerHp,
                    STRATEGY_HAND, playerBoard, "Campaign preset");
            GameService.GauntletSide enemySide = new GameService.GauntletSide(
                    enemy.name(), enemy.deck(), enemy.trainer(), enemy.hp(),
                    STRATEGY_HAND, enemy.board(), enemy.label());

            boolean official = kind == ArenaKind.KNIGHT || kind == ArenaKind.AKHAR || kind == ArenaKind.LEGENDARY;
            GameService.SoloHandle handle = gameService.newCampaignGame(
                    playerSide, enemySide, enemy.label(), official, true,
                    kind == ArenaKind.AKHAR ? run.ralliedLandIds.size() : 0);
            if (handle != null && handle.state() != null) applyHeldItems(run, handle.state());

            for (GameService.GauntletPlacement p : enemy.board()) {
                if (p != null && p.card() != null) run.seen.add(p.card().getId());
            }
            run.battleToken = handle.token();
            run.pendingArenaKind = kind;
            run.pendingArenaLandId = landId != null ? landId : (kind == ArenaKind.LEGENDARY ? run.currentLandId : null);
            run.pendingWildCardId = kind == ArenaKind.WILD ? wildCardId : null;
            run.pendingArenaArea = fightArea;
            run.lastBattleEncounter = enemy.label();
            run.phase = Phase.ARENA_BATTLE;
            persist(run);
            return handle.token();
        }
    }

    private List<GameService.GauntletPlacement> presetPlacements(CampaignRun run, List<String> ids) {
        List<GameService.GauntletPlacement> board = new ArrayList<>();
        Set<Integer> taken = new LinkedHashSet<>();
        for (String id : ids) {
            Card card = cardDefs.findCardCopy(id).orElse(null);
            if (!(card instanceof SieglingCard siegling)) continue;
            Integer cell = run.presetCells.get(id);
            if (cell == null || cell < 0 || cell > 8 || taken.contains(cell)) cell = firstFreeCell(taken);
            taken.add(cell);
            board.add(new GameService.GauntletPlacement(siegling, cell / 3, cell % 3));
        }
        return board;
    }

    private void applyHeldItems(CampaignRun run, GameState state) {
        for (CardInstance unit : state.getBoardSieglings(true)) {
            if (unit == null || unit.getCard() == null) continue;
            CampaignItems.Item item = CampaignItems.byId(run.equipped.get(unit.getCard().getId()));
            if (item == null) continue;
            switch (item.kind()) {
                case SHIELD -> unit.addShield(item.value());
                case VITALITY -> unit.addMaxHealthBoost(item.value());
                case SPEED -> unit.setCurrentSpeed(unit.getCurrentSpeed() + item.value());
            }
            state.log(unit.getCard().getName() + "'s " + item.name() + ": " + item.effectText() + ".");
        }
    }

    public CampaignRun settle(String token) {
        CampaignRun run = require(token);
        synchronized (run) {
            settleArenaIfNeeded(run);
            return persist(run);
        }
    }

    /** Leave an unfinished Arena duel without ending the whole campaign. */
    public CampaignRun retreatArena(String token) {
        CampaignRun run = require(token);
        synchronized (run) {
            if (run.phase != Phase.ARENA_BATTLE) return persist(run);
            ArenaKind kind = run.pendingArenaKind;
            if (run.pendingArenaArea != null) run.area = run.pendingArenaArea;
            run.battleToken = null;
            run.pendingArenaKind = null;
            run.pendingArenaLandId = null;
            run.pendingArenaArea = null;
            run.pendingWildCardId = null;
            run.lastBattleWon = false;
            run.lastMessage = "You withdrew from the duel.";
            run.phase = phaseForArea(run, kind);
            return persist(run);
        }
    }

    public CampaignRun abandon(String token) {
        CampaignRun run = require(token);
        synchronized (run) {
            run.phase = Phase.OVER;
            run.lastMessage = "Campaign ended.";
            wildSupport.clear(run.token);
            run.battleToken = null;
            return persist(run);
        }
    }

    private void settleArenaIfNeeded(CampaignRun run) {
        if (run.phase != Phase.ARENA_BATTLE || run.battleToken == null) return;
        GameState state = gameService.getSoloGame(run.battleToken);
        if (state == null) {
            // Redeploy dropped the match — return to where Bob was so the fight can reopen.
            if (run.pendingArenaArea != null) run.area = run.pendingArenaArea;
            run.phase = phaseForArea(run, run.pendingArenaKind);
            run.battleToken = null;
            run.pendingArenaKind = null;
            run.pendingArenaArea = null;
            run.pendingWildCardId = null;
            run.lastMessage = "The duel was interrupted. Challenge them again.";
            return;
        }
        if (!state.isGameOver()) return;

        boolean won = state.getWinner() != null && state.getWinner().equals(state.getPlayer().getName());
        run.lastBattleWon = won;
        ArenaKind kind = run.pendingArenaKind;
        String landId = run.pendingArenaLandId;
        String area = run.pendingArenaArea;
        String wildId = run.pendingWildCardId;
        run.battleToken = null;
        run.pendingArenaKind = null;
        run.pendingArenaLandId = null;
        run.pendingArenaArea = null;
        run.pendingWildCardId = null;
        if (area != null && !area.isBlank()) run.area = area;

        if (!won) {
            run.lastMessage = kind == ArenaKind.WILD ? "The wild Siegeling got away. Rest and try again."
                    : "Defeat. Regroup and try again.";
            run.phase = phaseForArea(run, kind);
            return;
        }

        run.gold += switch (kind) {
            case AKHAR -> 100;
            case LEGENDARY -> 60;
            case KNIGHT -> 40;
            case RIVAL -> 15;
            case WILD -> 8;
        };
        Random rng = new Random(System.nanoTime());
        if (kind == ArenaKind.WILD) {
            String name = cardName(wildId);
            if (wildId != null && !run.roster.contains(wildId) && cardDefs.findCardCopy(wildId).isPresent()) {
                run.roster.add(wildId);
                joinTeams(run, wildId);
                run.lastMessage = "You rallied " + name + " to your cause!";
                journal(run, "capture", "Caught " + name + ".");
            } else {
                run.lastMessage = name + " was driven off. Victory!";
            }
            run.phase = phaseForArea(run, kind);
        } else if (kind == ArenaKind.LEGENDARY && landId != null) {
            SiegeLand land = SiegeLand.byId(landId);
            String el = land == null ? landId : land.elements().get(0).name().toLowerCase();
            run.sigils.add(el);
            String legend = legendaryIdFor(el).map(this::cardName).orElse("The Legendary");
            run.lastMessage = legend + " yields. You earned the " + (land != null ? land.name() : el) + " Sigil!";
            journal(run, "sigil", "Defeated " + legend + " and earned the " + titleCase(el) + " Sigil.");
            run.phase = Phase.LAND;
        } else if (kind == ArenaKind.RIVAL && landId != null) {
            run.clearedRivalLandIds.add(landId);
            // Clearing a rival unlocks that Land's knight challenge and neighbors.
            unlockNeighbors(run, landId);
            SiegeLand land = SiegeLand.byId(landId);
            run.lastMessage = "Rival defeated. The realm's SiegeKnight awaits.";
            journal(run, "rival", "Beat the rival of " + (land != null ? land.name() : landId)
                    + ". Its SiegeKnight and Legendary shrine are open.");
            run.phase = Phase.LAND;
        } else if (kind == ArenaKind.KNIGHT && landId != null) {
            run.ralliedLandIds.add(landId);
            unlockNeighbors(run, landId);
            SiegeLand land = SiegeLand.byId(landId);
            run.lastMessage = (land != null ? land.name() : "The realm") + " joins your coalition!";
            journal(run, "rally", (land != null ? land.name() : "A realm") + " joined the coalition ("
                    + run.ralliedLandIds.size() + "/" + CampaignContent.RALLIES_TO_UNLOCK_AKHAR + ").");
            run.phase = Phase.RALLY;
            if (run.ralliedLandIds.size() >= CampaignContent.RALLIES_TO_UNLOCK_AKHAR) {
                run.phase = Phase.AKHAR_READY;
                run.lastMessage += " Raidlord Akhar's fortress stirs.";
            }
        } else if (kind == ArenaKind.AKHAR) {
            run.phase = Phase.VICTORY;
            run.lastMessage = "Raidlord Akhar falls. The realms stand united.";
            journal(run, "story", "Raidlord Akhar fell. The realms stand united.");
        } else {
            run.phase = Phase.LAND;
        }

        gainXp(run, switch (kind) {
            case WILD -> 25;
            case RIVAL -> 45;
            case KNIGHT -> 90;
            case LEGENDARY -> 140;
            case AKHAR -> 250;
        });
        int dropChance = switch (kind) { case WILD -> 30; case RIVAL -> 60; default -> 100; };
        if (rng.nextInt(100) < dropChance) {
            CampaignItems.Item item = CampaignItems.roll(kind, rng);
            run.items.add(item.id());
            run.lastMessage += " Found " + item.name() + ".";
            journal(run, "item", "Found " + item.name() + " (" + item.effectText() + ").");
        }
    }

    /** After a battle Bob returns to where he was walking. */
    private static Phase phaseForArea(CampaignRun run, ArenaKind kind) {
        if (kind == ArenaKind.AKHAR) return Phase.AKHAR_READY;
        String area = run.area == null ? "" : run.area;
        if (SiegeLand.byId(area) != null) {
            run.currentLandId = area;
            return Phase.LAND;
        }
        return run.ralliedLandIds.size() >= CampaignContent.RALLIES_TO_UNLOCK_AKHAR ? Phase.AKHAR_READY : Phase.WORLD;
    }

    private void gainXp(CampaignRun run, int amount) {
        if (run.level >= CampaignRun.MAX_LEVEL) return;
        run.xp += Math.max(0, amount);
        while (run.level < CampaignRun.MAX_LEVEL && run.xp >= CampaignRun.xpToNext(run.level)) {
            run.xp -= CampaignRun.xpToNext(run.level);
            run.level++;
            run.lastMessage += " Squire Bob reached level " + run.level + "!";
            journal(run, "level", "Squire Bob reached SiegeKnight level " + run.level + ".");
        }
        if (run.level >= CampaignRun.MAX_LEVEL) run.xp = 0;
    }

    private static void journal(CampaignRun run, String kind, String text) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("at", System.currentTimeMillis());
        entry.put("kind", kind);
        entry.put("text", text);
        run.journal.add(entry);
        while (run.journal.size() > 80) run.journal.remove(0);
    }

    private String cardName(String id) {
        if (id == null) return "A Siegeling";
        return cardDefs.findCardCopy(id).map(Card::getName).orElse(id);
    }

    private static String titleCase(String s) {
        if (s == null || s.isEmpty()) return "";
        return Character.toUpperCase(s.charAt(0)) + s.substring(1).toLowerCase();
    }

    private void unlockNeighbors(CampaignRun run, String landId) {
        run.unlockedLandIds.add(landId);
        List<SiegeLand> lands = CampaignContent.elementalLands();
        int idx = -1;
        for (int i = 0; i < lands.size(); i++) {
            if (lands.get(i).id().equals(landId)) { idx = i; break; }
        }
        if (idx < 0) return;
        if (idx > 0) run.unlockedLandIds.add(lands.get(idx - 1).id());
        if (idx + 1 < lands.size()) run.unlockedLandIds.add(lands.get(idx + 1).id());
    }

    // ---- View ------------------------------------------------------------

    public Map<String, Object> runView(CampaignRun run) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("token", run.token);
        m.put("phase", run.phase.name());
        m.put("playerName", run.playerName);
        m.put("starterId", run.starterId);
        m.put("starterElement", run.starterElement);
        m.put("trainerId", run.trainerId);
        m.put("gold", run.gold);
        m.put("lastMessage", run.lastMessage);
        m.put("currentLandId", run.currentLandId);
        m.put("roster", new ArrayList<>(run.roster));
        m.put("arenaPreset", new ArrayList<>(run.arenaPreset));
        m.put("presetCells", new LinkedHashMap<>(run.presetCells));
        m.put("arenaPartyMax", CampaignRun.ARENA_PARTY_MAX);
        List<String> squad = new ArrayList<>(run.siegeSquad);
        while (squad.size() < CampaignRun.SIEGE_SQUAD_MAX) squad.add(null);
        m.put("siegeSquad", squad);
        m.put("siegeSquadMax", CampaignRun.SIEGE_SQUAD_MAX);
        m.put("followerId", run.followerId != null && run.roster.contains(run.followerId) ? run.followerId : run.starterId);
        m.put("area", run.area);
        m.put("level", run.level);
        m.put("xp", run.xp);
        m.put("xpToNext", run.level >= CampaignRun.MAX_LEVEL ? 0 : CampaignRun.xpToNext(run.level));
        m.put("maxLevel", CampaignRun.MAX_LEVEL);
        m.put("items", new ArrayList<>(run.items));
        m.put("equipped", new LinkedHashMap<>(run.equipped));
        List<Map<String, Object>> itemDefs = new ArrayList<>();
        for (CampaignItems.Item item : CampaignItems.ALL) itemDefs.add(item.toMap());
        m.put("itemDefs", itemDefs);
        m.put("journal", new ArrayList<>(run.journal));
        m.put("seenCount", run.seen.size());
        // Squire Bob's card at his current level, for the Player screen.
        if (clientTrainerJson != null) {
            cardDefs.getActiveTrainerById(run.trainerId)
                    .map(t -> gameService.leveledTrainer(t, run.level))
                    .ifPresent(t -> m.put("squire", clientTrainerJson.apply(t)));
        }
        // One Sigil per elemental Land: its Legendary, and whether it has fallen.
        List<Map<String, Object>> sigils = new ArrayList<>();
        for (SiegeLand land : CampaignContent.elementalLands()) {
            String el = land.elements().get(0).name().toLowerCase();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("element", el);
            row.put("landId", land.id());
            row.put("landName", land.name());
            row.put("earned", run.sigils.contains(el));
            row.put("shrineOpen", run.clearedRivalLandIds.contains(land.id()));
            legendaryIdFor(el).flatMap(cardDefs::findCardCopy).ifPresent(c -> row.put("legendary", cardRow(c)));
            sigils.add(row);
        }
        m.put("sigils", sigils);
        // Roaming wild Siegelings for where Bob is walking (and the Wildlands, reachable from the Sanctuary).
        Map<String, Object> wilds = new LinkedHashMap<>();
        for (String area : List.of(run.area == null ? "sanctuary" : run.area, "wildlands")) {
            if (wilds.containsKey(area) || "sanctuary".equals(area)) continue;
            List<Map<String, Object>> rows = new ArrayList<>();
            for (String id : roamers(run, area)) {
                cardDefs.findCardCopy(id).ifPresent(c -> {
                    Map<String, Object> row = cardRow(c);
                    row.put("caught", run.roster.contains(id));
                    rows.add(row);
                });
            }
            wilds.put(area, rows);
        }
        m.put("wilds", wilds);
        m.put("unlockedLandIds", new ArrayList<>(run.unlockedLandIds));
        m.put("ralliedLandIds", new ArrayList<>(run.ralliedLandIds));
        m.put("clearedRivalLandIds", new ArrayList<>(run.clearedRivalLandIds));
        m.put("ralliesToUnlockAkhar", CampaignContent.RALLIES_TO_UNLOCK_AKHAR);
        m.put("akharUnlocked", run.ralliedLandIds.size() >= CampaignContent.RALLIES_TO_UNLOCK_AKHAR
                || run.phase == Phase.AKHAR_READY || run.phase == Phase.VICTORY);
        m.put("lastBattleWon", run.lastBattleWon);
        m.put("lastBattleEncounter", run.lastBattleEncounter);
        m.put("pendingArenaKind", run.pendingArenaKind == null ? null : run.pendingArenaKind.name());
        if (run.phase == Phase.ARENA_BATTLE && run.battleToken != null) {
            m.put("soloToken", run.battleToken);
        }

        List<Map<String, Object>> lands = new ArrayList<>();
        for (SiegeLand land : CampaignContent.elementalLands()) {
            Map<String, Object> row = new LinkedHashMap<>(land.toMap());
            boolean unlocked = run.unlockedLandIds.contains(land.id()) || run.ralliedLandIds.contains(land.id());
            boolean rallied = run.ralliedLandIds.contains(land.id());
            boolean rivalCleared = run.clearedRivalLandIds.contains(land.id());
            row.put("unlocked", unlocked);
            row.put("rallied", rallied);
            row.put("rivalCleared", rivalCleared);
            row.put("knightId", CampaignContent.REALM_KNIGHT_BY_LAND.get(land.id()));
            row.put("rivalId", CampaignContent.RIVAL_TRAINER_BY_LAND.get(land.id()));
            lands.add(row);
        }
        m.put("lands", lands);

        List<Map<String, Object>> rosterCards = new ArrayList<>();
        for (String id : run.roster) {
            cardDefs.findCardCopy(id).ifPresent(card -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", id);
                row.put("name", card.getName());
                row.put("element", card.getElement() == null ? null : card.getElement().name());
                row.put("artUrl", card.getCardArtUrl());
                row.put("cardArtMode", card.getCardArtMode());
                row.put("rarity", card.getRarity() == null ? null : card.getRarity().name());
                if (card instanceof SieglingCard sc) {
                    row.put("health", sc.getHealth());
                    row.put("speed", sc.getSpeed());
                    row.put("evolvesFromId", sc.getEvolvesFromId());
                }
                if (clientCardJson != null) row.put("card", clientCardJson.apply(card));
                rosterCards.add(row);
            });
        }
        m.put("rosterCards", rosterCards);

        if (run.phase == Phase.WILD_BATTLE) {
            m.put("pendingCaptureName", run.pendingCaptureName);
        }

        if (run.currentLandId != null) {
            SiegeLand land = SiegeLand.byId(run.currentLandId);
            if (land != null) {
                Map<String, Object> current = new LinkedHashMap<>(land.toMap());
                String el = land.elements().get(0).name().toLowerCase();
                current.put("sigilEarned", run.sigils.contains(el));
                current.put("shrineOpen", run.clearedRivalLandIds.contains(land.id()));
                legendaryIdFor(el).flatMap(cardDefs::findCardCopy).ifPresent(c -> current.put("legendary", cardRow(c)));
                m.put("currentLand", current);
            }
        }
        return m;
    }

    // ---- Internals -------------------------------------------------------

    private record EncounterSpec(String name, String label, int hp, TrainerCard trainer,
                                 List<Card> deck, List<GameService.GauntletPlacement> board) {}

    private EncounterSpec enemyFor(ArenaKind kind, String landId, int n, int ralliedCount) {
        if (kind == ArenaKind.AKHAR) {
            TrainerCard akhar = cardDefs.getActiveTrainerById(CampaignContent.AKHAR_ID)
                    .map(t -> gameService.leveledTrainer(t, 5 + ralliedCount))
                    .orElseThrow(() -> new IllegalStateException("Raidlord Akhar is not in the trainer catalog."));
            List<String> ids = shadowPack(n);
            return new EncounterSpec(akhar.getName(), "Raidlord Akhar", CampaignContent.OFFICIAL_HP, akhar,
                    strategyDeck(n), placements(ids, CampaignContent.ENEMY_SLOTS));
        }
        String trainerId = kind == ArenaKind.KNIGHT
                ? CampaignContent.REALM_KNIGHT_BY_LAND.get(landId)
                : CampaignContent.RIVAL_TRAINER_BY_LAND.get(landId);
        TrainerCard trainer = trainerId == null ? null
                : cardDefs.getActiveTrainerById(trainerId)
                .map(t -> gameService.leveledTrainer(t, kind == ArenaKind.KNIGHT ? 3 : 1))
                .orElse(null);
        SiegeLand land = SiegeLand.byId(landId);
        String label = kind == ArenaKind.KNIGHT
                ? (trainer != null ? trainer.getName() : "Realm SiegeKnight")
                : (trainer != null ? trainer.getName() : "Rival Trainer");
        if (land != null) label = label + " of " + land.name();
        List<String> boardIds = elementPack(land == null ? Element.NEUTRAL : land.elements().get(0), n);
        int hp = CampaignContent.playerHpFor(kind);
        return new EncounterSpec(label, label, hp, trainer, strategyDeck(n),
                placements(boardIds, CampaignContent.ENEMY_SLOTS));
    }

    private List<GameService.GauntletPlacement> placements(List<String> cardIds, int[][] slots) {
        List<GameService.GauntletPlacement> board = new ArrayList<>();
        int i = 0;
        for (String id : cardIds) {
            if (i >= slots.length) break;
            Card card = cardDefs.findCardCopy(id).orElse(null);
            if (!(card instanceof SieglingCard siegling)) continue;
            int[] cell = slots[i++];
            board.add(new GameService.GauntletPlacement(siegling, cell[0], cell[1]));
        }
        return board;
    }

    private List<Card> strategyDeck(int n) {
        List<Card> deck = new ArrayList<>();
        List<Card> pool = cardDefs.getDeckBuilderCatalog();
        for (Card card : pool) {
            if (card instanceof SpellCard || card instanceof TrapCard) {
                cardDefs.findCardCopy(card.getId()).ifPresent(deck::add);
            }
            if (deck.size() >= 8 + n) break;
        }
        if (deck.isEmpty()) {
            for (Card card : pool) {
                if (card instanceof SieglingCard) continue;
                cardDefs.findCardCopy(card.getId()).ifPresent(deck::add);
                if (deck.size() >= 6) break;
            }
        }
        return deck;
    }

    private List<String> elementPack(Element element, int n) {
        List<String> ids = new ArrayList<>();
        for (Card card : cardDefs.getDeckBuilderCatalog()) {
            if (!(card instanceof SieglingCard siegling)) continue;
            if (element != null && element != Element.NEUTRAL && card.getElement() != element) continue;
            if (siegling.getEvolvesFromId() != null && !siegling.getEvolvesFromId().isBlank()) continue;
            ids.add(card.getId());
            if (ids.size() >= n) break;
        }
        if (ids.isEmpty()) {
            for (Card card : cardDefs.getDeckBuilderCatalog()) {
                if (card instanceof SieglingCard) {
                    ids.add(card.getId());
                    if (ids.size() >= n) break;
                }
            }
        }
        List<String> out = new ArrayList<>();
        for (int i = 0; i < n && !ids.isEmpty(); i++) {
            out.add(ids.get(i % ids.size()));
        }
        return out;
    }

    private List<String> shadowPack(int n) {
        List<String> ids = new ArrayList<>(elementPack(Element.SHADOW, n));
        if (ids.size() < n) {
            for (String id : elementPack(Element.UNDEAD, n)) {
                if (!ids.contains(id)) ids.add(id);
                if (ids.size() >= n) break;
            }
        }
        return ids.size() > n ? new ArrayList<>(ids.subList(0, n)) : ids;
    }

    private static ArenaKind parseKind(String raw) {
        if (raw == null) throw new IllegalArgumentException("Pick rival, knight, wild, legendary, or akhar.");
        return switch (raw.trim().toUpperCase()) {
            case "RIVAL" -> ArenaKind.RIVAL;
            case "KNIGHT" -> ArenaKind.KNIGHT;
            case "AKHAR" -> ArenaKind.AKHAR;
            case "WILD" -> ArenaKind.WILD;
            case "LEGENDARY" -> ArenaKind.LEGENDARY;
            default -> throw new IllegalArgumentException("Pick rival, knight, wild, legendary, or akhar.");
        };
    }

    // ---- Open world: wild pools, Legendaries, CoDex ------------------------

    /** Element ids whose wild Siegelings roam an area: a Land's own, or every opened Land's in the Wildlands. */
    private static Set<Element> areaElements(CampaignRun run, String area) {
        Set<Element> out = new LinkedHashSet<>();
        SiegeLand land = SiegeLand.byId(area);
        if (land != null) {
            out.add(land.elements().get(0));
            return out;
        }
        if ("wildlands".equals(area)) {
            for (String id : run.unlockedLandIds) {
                SiegeLand l = SiegeLand.byId(id);
                if (l != null) out.add(l.elements().get(0));
            }
            for (String id : run.ralliedLandIds) {
                SiegeLand l = SiegeLand.byId(id);
                if (l != null) out.add(l.elements().get(0));
            }
        }
        return out;
    }

    /** Basic-stage Common/Uncommon Siegelings that can roam an area (Legendaries never roam). */
    private List<SieglingCard> wildPool(CampaignRun run, String area) {
        Set<Element> elements = areaElements(run, area);
        List<SieglingCard> out = new ArrayList<>();
        if (elements.isEmpty()) return out;
        for (Card card : cardDefs.getDeckBuilderCatalog()) {
            if (!(card instanceof SieglingCard s)) continue;
            if (!elements.contains(card.getElement())) continue;
            if (s.getEvolvesFromId() != null && !s.getEvolvesFromId().isBlank()) continue;
            Rarity r = card.getRarity();
            if (r != Rarity.COMMON && r != Rarity.UNCOMMON) continue;
            out.add(s);
        }
        return out;
    }

    private Set<String> wildPoolIds(CampaignRun run, String area) {
        Set<String> ids = new LinkedHashSet<>();
        for (SieglingCard s : wildPool(run, area)) ids.add(s.getId());
        return ids;
    }

    /** The roamers shown in an area this visit: a stable handful drawn from its pool. */
    private List<String> roamers(CampaignRun run, String area) {
        List<SieglingCard> pool = new ArrayList<>(wildPool(run, area));
        Collections.shuffle(pool, new Random((run.token + "|" + area + "|" + run.journal.size()).hashCode()));
        int count = "wildlands".equals(area) ? 6 : 3;
        List<String> ids = new ArrayList<>();
        for (SieglingCard s : pool) {
            if (ids.size() >= count) break;
            ids.add(s.getId());
        }
        return ids;
    }

    /** A wild pack: the roamer Bob walked into plus kin as the Squire grows stronger. */
    private EncounterSpec wildEncounter(CampaignRun run, String area, String leadId) {
        int n = Math.min(CampaignRun.ARENA_PARTY_MAX, 1 + (run.level >= 3 ? 1 : 0) + (run.level >= 6 ? 1 : 0));
        List<String> ids = new ArrayList<>();
        ids.add(leadId);
        Card lead = cardDefs.findCardCopy(leadId).orElse(null);
        List<SieglingCard> kin = new ArrayList<>(wildPool(run, area));
        Collections.shuffle(kin, new Random(System.nanoTime()));
        for (SieglingCard s : kin) {
            if (ids.size() >= n) break;
            if (lead != null && s.getElement() != lead.getElement()) continue;
            if (!ids.contains(s.getId())) ids.add(s.getId());
        }
        String name = "Wild " + cardName(leadId);
        return new EncounterSpec(name, name, 12 + 4 * ids.size(), null, strategyDeck(ids.size()),
                placements(ids, CampaignContent.ENEMY_SLOTS));
    }

    /** One Legendary per element; the table names the current one, the catalog is the fallback. */
    private Optional<String> legendaryIdFor(String elementId) {
        String preferred = CampaignContent.LEGENDARY_BY_ELEMENT.get(elementId);
        if (preferred != null && cardDefs.findCardCopy(preferred).filter(c -> c instanceof SieglingCard).isPresent()) {
            return Optional.of(preferred);
        }
        for (Card card : cardDefs.getDeckBuilderCatalog()) {
            if (card instanceof SieglingCard && card.getRarity() == Rarity.LEGENDARY
                    && card.getElement() != null && card.getElement().name().equalsIgnoreCase(elementId)) {
                return Optional.of(card.getId());
            }
        }
        return Optional.empty();
    }

    private EncounterSpec legendaryEncounter(String landId) {
        SiegeLand land = SiegeLand.byId(landId);
        if (land == null) throw new IllegalArgumentException("Enter a Land first.");
        Element element = land.elements().get(0);
        String legendId = legendaryIdFor(element.name().toLowerCase())
                .orElseThrow(() -> new IllegalStateException(land.name() + " has no Legendary in the catalog."));
        List<String> ids = new ArrayList<>();
        ids.add(legendId);
        for (String id : elementPack(element, 2)) {
            if (ids.size() >= CampaignRun.ARENA_PARTY_MAX) break;
            ids.add(id);
        }
        String label = cardName(legendId) + " of " + land.name();
        return new EncounterSpec(label, label, CampaignContent.OFFICIAL_HP, null, strategyDeck(ids.size()),
                placements(ids, CampaignContent.ENEMY_SLOTS));
    }

    private Map<String, Object> cardRow(Card card) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", card.getId());
        row.put("name", card.getName());
        row.put("element", card.getElement() == null ? null : card.getElement().name());
        row.put("rarity", card.getRarity() == null ? null : card.getRarity().name());
        row.put("artUrl", card.getCardArtUrl());
        row.put("cardArtMode", card.getCardArtMode());
        if (card instanceof SieglingCard s) {
            row.put("health", s.getHealth());
            row.put("speed", s.getSpeed());
            row.put("evolvesFromId", s.getEvolvesFromId());
        }
        return row;
    }

    /** Every Siegeling in the catalog with this run's status: caught, seen, or unknown (a silhouette). */
    public Map<String, Object> codex(String token) {
        CampaignRun run = require(token);
        List<Map<String, Object>> entries = new ArrayList<>();
        Map<String, List<String>> evolvesTo = new LinkedHashMap<>();
        List<SieglingCard> all = new ArrayList<>();
        for (Card card : cardDefs.getDeckBuilderCatalog()) {
            if (card instanceof SieglingCard s) all.add(s);
        }
        for (SieglingCard s : all) {
            String from = s.getEvolvesFromId();
            if (from != null && !from.isBlank()) evolvesTo.computeIfAbsent(from, k -> new ArrayList<>()).add(s.getId());
        }
        int caught = 0, seen = 0;
        for (SieglingCard s : all) {
            Map<String, Object> row = cardRow(s);
            String status = run.roster.contains(s.getId()) ? "caught" : run.seen.contains(s.getId()) ? "seen" : "unknown";
            if ("caught".equals(status)) caught++;
            if (!"unknown".equals(status)) seen++;
            row.put("status", status);
            row.put("evolvesTo", evolvesTo.getOrDefault(s.getId(), List.of()));
            entries.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("entries", entries);
        out.put("total", entries.size());
        out.put("caught", caught);
        out.put("seen", seen);
        return out;
    }

    private CampaignRun require(String token) {
        if (token == null || token.isBlank()) throw new IllegalArgumentException("Missing campaign token.");
        CampaignRun run = runs.get(token);
        if (run == null) {
            run = store.load(token).orElse(null);
            if (run != null) runs.put(token, run);
        }
        if (run == null || run.phase == Phase.OVER) {
            throw new IllegalArgumentException("Campaign run not found.");
        }
        return run;
    }

    private static void requirePhase(CampaignRun run, Phase... allowed) {
        for (Phase p : allowed) if (run.phase == p) return;
        throw new IllegalStateException("That action is not available right now (" + run.phase + ").");
    }

    private CampaignRun persist(CampaignRun run) {
        run.savedAtMillis = System.currentTimeMillis();
        runs.put(run.token, run);
        store.save(run);
        return run;
    }

    private String newToken() {
        byte[] bytes = new byte[18];
        tokens.nextBytes(bytes);
        StringBuilder sb = new StringBuilder("camp_");
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
