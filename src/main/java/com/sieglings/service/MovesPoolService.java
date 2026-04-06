package com.sieglings.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.model.Ability;
import com.sieglings.model.Move;
import com.sieglings.model.MoveCategory;
import com.sieglings.model.SieglingCard;
import com.sieglings.model.enums.Element;
import com.sieglings.model.enums.Reaction;
import com.sieglings.model.enums.Row;
import com.sieglings.model.enums.TargetType;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Loads classpath moves, merges editor-published moves from card overrides, and resolves {@link SieglingCard#moveIds}.
 */
@Service
public class MovesPoolService {

    public static final int MAX_MOVES_PER_SIEGLING = SieglingCard.MAX_MOVES_PER_SIEGLING;
    private static final String CLASSPATH_MOVES = "cards/moves-pool.json";

    private final ObjectMapper objectMapper;
    private final CardOverrideStorageService overrideStorage;
    private final Map<String, Move> movesById = new ConcurrentHashMap<>();

    @Autowired
    public MovesPoolService(ObjectMapper objectMapper,
                            @Autowired(required = false) CardOverrideStorageService overrideStorage) {
        this.objectMapper = objectMapper;
        this.overrideStorage = overrideStorage;
        reloadClasspathOnly();
    }

    @PostConstruct
    void mergeEditorMovesOnStartup() {
        overlayFromStorageSnapshot();
    }

    /** Classpath moves plus optional editor moves from the active card override snapshot. */
    public synchronized void syncFromSources() {
        reloadClasspathOnly();
        overlayFromStorageSnapshot();
    }

    private void overlayFromStorageSnapshot() {
        if (overrideStorage == null) {
            return;
        }
        try {
            JsonNode root = overrideStorage.loadSnapshot().data();
            JsonNode movesNode = root.get("moves");
            if (movesNode == null || !movesNode.isArray()) {
                return;
            }
            for (JsonNode node : movesNode) {
                MoveDefinition def = objectMapper.treeToValue(node, MoveDefinition.class);
                Move move = fromDefinition(def);
                if (move != null) {
                    movesById.put(move.id().toLowerCase(Locale.ROOT), move);
                }
            }
        } catch (Exception ignored) {
            // Keep classpath-only pool if snapshot parsing fails.
        }
    }

    public void reloadClasspathOnly() {
        movesById.clear();
        loadClasspathMovesInto(movesById);
    }

    public void reloadClasspathAndOverlayEditor(List<MoveDefinition> editorMoves) {
        reloadClasspathOnly();
        overlayEditorMoves(editorMoves);
    }

    public void overlayEditorMoves(List<MoveDefinition> editorMoves) {
        if (editorMoves == null) {
            return;
        }
        for (MoveDefinition def : editorMoves) {
            Move move = fromDefinition(def);
            if (move != null) {
                movesById.put(move.id().toLowerCase(Locale.ROOT), move);
            }
        }
    }

    /**
     * Ensures a generated Siegling with only {@link SieglingCard#getAbility()} gets a stable pool id and {@code moveIds}.
     */
    public void hydrateGeneratedCard(SieglingCard card) {
        if (card == null) {
            return;
        }
        if (card.getMoveIds() != null && !card.getMoveIds().isEmpty()) {
            return;
        }
        Ability printed = card.getAbility();
        if (printed == null) {
            return;
        }
        Optional<Move> pooled = pickClosestPoolMove(card.getElement(), printed);
        if (pooled.isPresent()) {
            Move pick = pooled.get();
            card.setMoveIds(List.of(pick.id()));
            card.setAbility(null);
            return;
        }
        String id = "gen:" + card.getId().toLowerCase(Locale.ROOT) + ":primary";
        Move move = fromPrintedAbility(id, printed, card.getElement(), MoveCategory.STANDARD);
        movesById.put(id.toLowerCase(Locale.ROOT), move);
        card.setMoveIds(List.of(id));
        card.setAbility(null);
    }

    /**
     * Picks a classpath/editor move for the same element whose effect and target type match the printed ability,
     * then minimizes difference in effect value and energy cost. If nothing matches, the caller should fall back
     * to a generated {@code gen:...} move.
     */
    private Optional<Move> pickClosestPoolMove(Element element, Ability printed) {
        if (element == null || printed == null) {
            return Optional.empty();
        }
        String wantEffect = normalizeEffectKey(printed.getEffectType());
        TargetType wantTarget = printed.getTargetType();
        if (wantEffect.isBlank() || wantTarget == null) {
            return Optional.empty();
        }
        Move best = null;
        int bestScore = Integer.MAX_VALUE;
        for (Move m : movesById.values()) {
            if (m.element() != element) {
                continue;
            }
            String mid = m.id().toLowerCase(Locale.ROOT);
            if (mid.startsWith("gen:") || mid.startsWith("legacy:")) {
                continue;
            }
            if (!normalizeEffectKey(m.effectType()).equals(wantEffect)) {
                continue;
            }
            if (m.targetType() != wantTarget) {
                continue;
            }
            int score = Math.abs(printed.getEffectValue() - m.effectValue())
                    + Math.abs(printed.getRequiredEnergy() - m.energyCost()) * 2;
            if (printed.getTargetType() == TargetType.ROW_ENEMIES || printed.getTargetType() == TargetType.ROW_ALLIES) {
                Row pr = printed.getTargetRow();
                Row mr = m.targetRow();
                if (pr != null && mr != null && pr != mr) {
                    score += 40;
                }
            }
            if (score < bestScore) {
                bestScore = score;
                best = m;
            }
        }
        return Optional.ofNullable(best);
    }

    private static String normalizeEffectKey(String raw) {
        if (raw == null) {
            return "";
        }
        return raw.trim().toLowerCase(Locale.ROOT);
    }

    public Move registerLegacyManualMove(String moveId, ManualSieglingCatalog.ManualAbilityDefinition def, Element cardElement) {
        Objects.requireNonNull(moveId, "moveId");
        Objects.requireNonNull(def, "def");
        Move move = fromManualDefinition(moveId, def, cardElement);
        movesById.put(move.id().toLowerCase(Locale.ROOT), move);
        return move;
    }

    /** Replaces or inserts a move (dashboard / tests). */
    public void putMove(Move move) {
        if (move == null || move.id() == null || move.id().isBlank()) {
            return;
        }
        movesById.put(move.id().toLowerCase(Locale.ROOT), move);
    }

    public Move getMove(String id) {
        if (id == null || id.isBlank()) {
            return null;
        }
        return movesById.get(id.trim().toLowerCase(Locale.ROOT));
    }

    public List<Move> allMovesSorted() {
        return movesById.values().stream()
                .sorted(Comparator.comparing(Move::element).thenComparing(Move::name))
                .toList();
    }

    public List<Ability> resolveAbilities(List<String> moveIds) {
        List<Ability> out = new ArrayList<>();
        if (moveIds == null) {
            return out;
        }
        for (String rawId : moveIds) {
            if (rawId == null || rawId.isBlank()) {
                continue;
            }
            Move move = getMove(rawId);
            if (move != null) {
                out.add(move.toAbility());
            }
        }
        return out;
    }

    public List<Ability> resolvePrintedAbilities(SieglingCard card) {
        if (card == null) {
            return List.of();
        }
        return resolveAbilities(card.getMoveIds());
    }

    public static List<String> trimMoveIds(List<String> moveIds) {
        return SieglingCard.normalizeMoveIds(moveIds);
    }

    private void loadClasspathMovesInto(Map<String, Move> sink) {
        try {
            ClassPathResource resource = new ClassPathResource(CLASSPATH_MOVES);
            if (!resource.exists()) {
                return;
            }
            try (InputStream stream = resource.getInputStream()) {
                MovesFile file = objectMapper.readValue(stream, MovesFile.class);
                if (file == null || file.moves() == null) {
                    return;
                }
                for (MoveDefinition def : file.moves()) {
                    Move move = fromDefinition(def);
                    if (move != null) {
                        sink.put(move.id().toLowerCase(Locale.ROOT), move);
                    }
                }
            }
        } catch (IOException ex) {
            throw new IllegalStateException("Unable to load moves pool from classpath: " + CLASSPATH_MOVES, ex);
        }
    }

    private Move fromDefinition(MoveDefinition def) {
        if (def == null || def.id() == null || def.id().isBlank()) {
            return null;
        }
        MoveCategory category = def.category() != null ? def.category() : MoveCategory.STANDARD;
        int targetCount = def.targetCount() != null ? def.targetCount() : 0;
        int effectValue = def.effectValue() != null ? def.effectValue() : 0;
        int energyCost = def.energyCost() != null ? def.energyCost() : 0;
        boolean passive = Boolean.TRUE.equals(def.isPassive());
        return new Move(
                def.id().trim(),
                def.name() != null ? def.name().trim() : def.id(),
                def.element(),
                category,
                def.targetType(),
                def.targetRow(),
                targetCount,
                def.effectType() != null ? def.effectType().trim().toLowerCase(Locale.ROOT) : "",
                effectValue,
                energyCost,
                def.description() != null ? def.description() : "",
                passive,
                def.requiredElement(),
                def.requiredReaction()
        );
    }

    private Move fromPrintedAbility(String id, Ability printed, Element cardElement, MoveCategory category) {
        TargetType tt = printed.getTargetType() != null ? printed.getTargetType() : TargetType.SINGLE_ENEMY;
        String desc = printed.getDescription() != null ? printed.getDescription() : "";
        Element el = cardElement != null ? cardElement : Element.NEUTRAL;
        return new Move(
                id,
                printed.getName() != null ? printed.getName() : id,
                el,
                category,
                tt,
                printed.getTargetRow(),
                printed.getTargetCount(),
                printed.getEffectType() != null ? printed.getEffectType() : "",
                printed.getEffectValue(),
                Math.max(0, printed.getRequiredEnergy()),
                desc,
                printed.isPassive() || tt == TargetType.PASSIVE,
                printed.getRequiredElement(),
                printed.getRequiredReaction()
        );
    }

    private Move fromManualDefinition(String id, ManualSieglingCatalog.ManualAbilityDefinition def, Element cardElement) {
        TargetType tt = def.targetType() != null ? def.targetType() : TargetType.SINGLE_ENEMY;
        int targetCount = def.targetCount() != null ? def.targetCount() : 0;
        int effectValue = def.effectValue() != null ? def.effectValue() : 0;
        int energy = def.requiredEnergy() != null ? def.requiredEnergy() : 0;
        boolean passive = Boolean.TRUE.equals(def.passive());
        String effectType = def.effectType() != null ? def.effectType().trim().toLowerCase(Locale.ROOT) : "";
        Element el = cardElement != null ? cardElement : Element.NEUTRAL;
        return new Move(
                id,
                def.name() != null ? def.name().trim() : id,
                el,
                MoveCategory.STANDARD,
                tt,
                def.targetRow(),
                targetCount,
                effectType,
                effectValue,
                energy,
                def.description() != null ? def.description() : "",
                passive || tt == TargetType.PASSIVE,
                def.requiredElement(),
                def.requiredReaction()
        );
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record MovesFile(List<MoveDefinition> moves) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record MoveDefinition(
            String id,
            String name,
            Element element,
            MoveCategory category,
            TargetType targetType,
            Row targetRow,
            Integer targetCount,
            String effectType,
            Integer effectValue,
            Integer energyCost,
            String description,
            Boolean isPassive,
            Element requiredElement,
            Reaction requiredReaction
    ) {}
}
