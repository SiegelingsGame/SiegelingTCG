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

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
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

    void useClientCardJson(Function<Card, Map<String, Object>> serializer) {
        this.clientCardJson = serializer;
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
        run.unlockedLandIds.add(starter.landId());
        // Soft-unlock adjacent starter lands so the world map is not a single tile.
        for (CampaignContent.Starter s : CampaignContent.STARTERS) {
            run.unlockedLandIds.add(s.landId());
        }
        run.currentLandId = starter.landId();
        run.phase = Phase.WORLD;
        run.lastMessage = "You set out from the Sanctuary as a Squire with " + starter.name() + ".";
        run.gold = 20;
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
            run.lastMessage = "You enter " + land.name() + ".";
            return persist(run);
        }
    }

    public CampaignRun setPreset(String token, List<String> cardIds) {
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
                if (clean.size() >= 5) break;
            }
            if (clean.isEmpty()) throw new IllegalArgumentException("Pick at least one Siegeling.");
            run.arenaPreset = clean;
            run.lastMessage = "Arena preset set (" + clean.size() + ").";
            return persist(run);
        }
    }

    // ---- Wild (Siege AP) -------------------------------------------------

    public CampaignRun startWild(String token) {
        CampaignRun run = require(token);
        synchronized (run) {
            settleArenaIfNeeded(run);
            requirePhase(run, Phase.LAND);
            SiegeLand land = SiegeLand.byId(run.currentLandId);
            if (land == null) throw new IllegalArgumentException("Enter a Land first.");

            TrainerCard squire = cardDefs.getActiveTrainerById(CampaignContent.SQUIRE_ID)
                    .orElseThrow(() -> new IllegalStateException("Squire Bob missing."));
            List<String> partyIds = new ArrayList<>(run.arenaPreset.isEmpty() ? run.roster : run.arenaPreset);
            Random rng = new Random(run.token.hashCode() ^ System.nanoTime());
            CampaignWildSupport.StartResult started = wildSupport.start(run.token, squire, partyIds, land, rng);
            run.pendingCaptureCardId = started.captureCardId();
            run.pendingCaptureName = started.captureName();
            run.phase = Phase.WILD_BATTLE;
            run.lastMessage = "A wild " + started.captureName() + " blocks the path!";
            return persist(run);
        }
    }

    public CampaignRun wildPlay(String token, String cardId, String targetId) {
        CampaignRun run = require(token);
        synchronized (run) {
            requirePhase(run, Phase.WILD_BATTLE);
            wildSupport.play(run.token, cardId, targetId, new Random(System.nanoTime()));
            finishWildIfOver(run);
            return persist(run);
        }
    }

    public CampaignRun wildEndTurn(String token) {
        CampaignRun run = require(token);
        synchronized (run) {
            requirePhase(run, Phase.WILD_BATTLE);
            wildSupport.endTurn(run.token, new Random(System.nanoTime()));
            finishWildIfOver(run);
            return persist(run);
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
        if (wildSupport.won(run.token)) {
            String captureId = run.pendingCaptureCardId;
            if (captureId != null && cardDefs.findCardCopy(captureId).isPresent() && !run.roster.contains(captureId)) {
                run.roster.add(captureId);
                if (run.arenaPreset.size() < 5) run.arenaPreset.add(captureId);
                run.lastMessage = "You rallied " + run.pendingCaptureName + " to your cause!";
                run.gold += 8;
            } else {
                SiegeLand land = SiegeLand.byId(run.currentLandId);
                run.lastMessage = "Victory in the wilds of " + (land != null ? land.name() : "the Land") + ".";
                run.gold += 5;
            }
            run.phase = Phase.LAND;
        } else {
            run.lastMessage = "Your warband was driven back. Rest and try again.";
            run.phase = Phase.LAND;
        }
        wildSupport.clear(run.token);
        run.pendingCaptureCardId = null;
        run.pendingCaptureName = null;
    }

    // ---- Arena (Battle Table) --------------------------------------------

    public String startArena(String token, String kindRaw) {
        CampaignRun run = require(token);
        synchronized (run) {
            settleArenaIfNeeded(run);
            ArenaKind kind = parseKind(kindRaw);
            if (kind == ArenaKind.AKHAR) {
                requirePhase(run, Phase.AKHAR_READY, Phase.WORLD, Phase.LAND);
                if (run.ralliedLandIds.size() < CampaignContent.RALLIES_TO_UNLOCK_AKHAR) {
                    throw new IllegalArgumentException("Rally more kingdoms before challenging Akhar.");
                }
            } else {
                requirePhase(run, Phase.LAND);
            }
            if (run.arenaPreset.isEmpty()) {
                throw new IllegalArgumentException("Set your Arena preset first.");
            }

            int n = CampaignContent.partySizeFor(kind, run.arenaPreset.size());
            List<String> playerIds = run.arenaPreset.subList(0, Math.min(n, run.arenaPreset.size()));
            List<GameService.GauntletPlacement> playerBoard = placements(playerIds, CampaignContent.PLAYER_SLOTS);
            List<Card> playerDeck = strategyDeck(n);

            TrainerCard playerTrainer = cardDefs.getActiveTrainerById(run.trainerId)
                    .map(t -> gameService.leveledTrainer(t, 1))
                    .orElse(null);

            String landId = kind == ArenaKind.AKHAR ? null : run.currentLandId;
            EncounterSpec enemy = enemyFor(kind, landId, n, run.ralliedLandIds.size());

            GameService.GauntletSide playerSide = new GameService.GauntletSide(
                    run.playerName, playerDeck, playerTrainer, CampaignContent.playerHpFor(kind),
                    STRATEGY_HAND, playerBoard, "Campaign preset");
            GameService.GauntletSide enemySide = new GameService.GauntletSide(
                    enemy.name(), enemy.deck(), enemy.trainer(), enemy.hp(),
                    STRATEGY_HAND, enemy.board(), enemy.label());

            boolean official = kind != ArenaKind.RIVAL;
            GameService.SoloHandle handle = gameService.newCampaignGame(
                    playerSide, enemySide, enemy.label(), official, true,
                    kind == ArenaKind.AKHAR ? run.ralliedLandIds.size() : 0);

            run.battleToken = handle.token();
            run.pendingArenaKind = kind;
            run.pendingArenaLandId = landId;
            run.lastBattleEncounter = enemy.label();
            run.phase = Phase.ARENA_BATTLE;
            persist(run);
            return handle.token();
        }
    }

    public CampaignRun settle(String token) {
        CampaignRun run = require(token);
        synchronized (run) {
            settleArenaIfNeeded(run);
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
            // Redeploy dropped the match — return to land so the fight can reopen.
            run.phase = run.pendingArenaKind == ArenaKind.AKHAR ? Phase.AKHAR_READY : Phase.LAND;
            run.battleToken = null;
            run.lastMessage = "The duel was interrupted. Challenge them again.";
            return;
        }
        if (!state.isGameOver()) return;

        boolean won = state.getWinner() != null && state.getWinner().equals(state.getPlayer().getName());
        run.lastBattleWon = won;
        ArenaKind kind = run.pendingArenaKind;
        String landId = run.pendingArenaLandId;
        run.battleToken = null;
        run.pendingArenaKind = null;
        run.pendingArenaLandId = null;

        if (!won) {
            run.lastMessage = "Defeat. Regroup and try again.";
            run.phase = kind == ArenaKind.AKHAR ? Phase.AKHAR_READY : Phase.LAND;
            return;
        }

        run.gold += kind == ArenaKind.AKHAR ? 100 : kind == ArenaKind.KNIGHT ? 40 : 15;
        if (kind == ArenaKind.RIVAL && landId != null) {
            run.clearedRivalLandIds.add(landId);
            // Clearing a rival unlocks that Land's knight challenge and neighbors.
            unlockNeighbors(run, landId);
            run.lastMessage = "Rival defeated. The realm's SiegeKnight awaits.";
            run.phase = Phase.LAND;
        } else if (kind == ArenaKind.KNIGHT && landId != null) {
            run.ralliedLandIds.add(landId);
            unlockNeighbors(run, landId);
            SiegeLand land = SiegeLand.byId(landId);
            run.lastMessage = (land != null ? land.name() : "The realm") + " joins your coalition!";
            run.phase = Phase.RALLY;
            if (run.ralliedLandIds.size() >= CampaignContent.RALLIES_TO_UNLOCK_AKHAR) {
                run.phase = Phase.AKHAR_READY;
                run.lastMessage += " Raidlord Akhar's fortress stirs.";
            }
        } else if (kind == ArenaKind.AKHAR) {
            run.phase = Phase.VICTORY;
            run.lastMessage = "Raidlord Akhar falls. The realms stand united.";
        } else {
            run.phase = Phase.LAND;
        }
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
        m.put("unlockedLandIds", new ArrayList<>(run.unlockedLandIds));
        m.put("ralliedLandIds", new ArrayList<>(run.ralliedLandIds));
        m.put("clearedRivalLandIds", new ArrayList<>(run.clearedRivalLandIds));
        m.put("ralliesToUnlockAkhar", CampaignContent.RALLIES_TO_UNLOCK_AKHAR);
        m.put("akharUnlocked", run.ralliedLandIds.size() >= CampaignContent.RALLIES_TO_UNLOCK_AKHAR
                || run.phase == Phase.AKHAR_READY || run.phase == Phase.VICTORY);
        m.put("lastBattleWon", run.lastBattleWon);
        m.put("lastBattleEncounter", run.lastBattleEncounter);
        m.put("pendingArenaKind", run.pendingArenaKind == null ? null : run.pendingArenaKind.name());

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
                if (clientCardJson != null) row.put("card", clientCardJson.apply(card));
                rosterCards.add(row);
            });
        }
        m.put("rosterCards", rosterCards);

        if (run.phase == Phase.WILD_BATTLE) {
            m.put("wildBattle", wildSupport.battleView(run.token));
            m.put("pendingCaptureName", run.pendingCaptureName);
        }

        if (run.currentLandId != null) {
            SiegeLand land = SiegeLand.byId(run.currentLandId);
            if (land != null) m.put("currentLand", land.toMap());
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
        if (raw == null) throw new IllegalArgumentException("Pick rival, knight, or akhar.");
        return switch (raw.trim().toUpperCase()) {
            case "RIVAL" -> ArenaKind.RIVAL;
            case "KNIGHT" -> ArenaKind.KNIGHT;
            case "AKHAR" -> ArenaKind.AKHAR;
            default -> throw new IllegalArgumentException("Pick rival, knight, or akhar.");
        };
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
