package com.sieglings.keep;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Versioned narrative content for discoveries, story voices, and RNG visitors in My Keep. */
@Component
public class KeepLoreCatalog {
    public static final String KIND_STORY = "STORY";
    public static final String KIND_VISITOR = "VISITOR";
    /** Recurring sanctuary encounters — same roll/cooldown pool as visitors, affinity-focused. */
    public static final String KIND_INTERACTION = "INTERACTION";

    public record LoreEntry(String id, String type, String title, String source, String perspective,
                            String era, String summary, String body, String artKey) { }

    public record Outcome(String id, int weight, String response, int relationshipDelta, String flag,
                          int timberDelta, Map<String, Integer> materialDeltas, String unlockLoreId) { }

    public record ConversationChoice(String id, String label, String response, int relationshipDelta, String flag,
                                     int timberCost, Map<String, Integer> materialCosts,
                                     int timberDelta, Map<String, Integer> materialDeltas,
                                     String unlockLoreId, List<Outcome> outcomes) { }

    public record Conversation(String id, String npcId, String npcName, String npcRole, String kicker,
                               String prompt, String kind, int weight, int cooldownHours,
                               int minStorehouseLevel, List<String> requiresLoreIds,
                               List<String> requiresFlags, boolean oneTime,
                               List<ConversationChoice> choices) { }

    public record CatalogFile(List<LoreEntry> entries, List<Conversation> conversations) { }

    private final ObjectMapper mapper;
    private final Map<String, LoreEntry> entries = new LinkedHashMap<>();
    private final Map<String, Conversation> conversations = new LinkedHashMap<>();

    public KeepLoreCatalog(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @PostConstruct
    public void load() {
        try (InputStream stream = new ClassPathResource("keep/keep-lore.json").getInputStream()) {
            CatalogFile file = mapper.readValue(stream, CatalogFile.class);
            entries.clear();
            conversations.clear();
            for (LoreEntry entry : safe(file.entries())) {
                requireUnique(entries, entry.id(), entry, "lore entry");
            }
            for (Conversation conversation : safe(file.conversations())) {
                requireUnique(conversations, conversation.id(), normalize(conversation), "conversation");
            }
            validateReferences();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to load My Keep lore catalog.", ex);
        }
    }

    public LoreEntry entry(String id) {
        return entries.get(id);
    }

    public Conversation conversation(String id) {
        return conversations.get(id);
    }

    public List<LoreEntry> entries(List<String> ids) {
        List<LoreEntry> out = new ArrayList<>();
        for (String id : safe(ids)) {
            LoreEntry entry = entries.get(id);
            if (entry != null) out.add(entry);
        }
        return out;
    }

    public List<Conversation> allConversations() {
        return List.copyOf(conversations.values());
    }

    public List<Conversation> visitorTemplates() {
        return conversations.values().stream().filter(this::isRollingEncounter).toList();
    }

    /** One-shot consequence interactions activated immediately by a poor dialogue choice. */
    public List<Conversation> followupsForFlag(String flag) {
        if (flag == null || flag.isBlank()) return List.of();
        return conversations.values().stream()
                .filter(this::isInteraction)
                .filter(Conversation::oneTime)
                .filter(value -> value.requiresFlags().contains(flag))
                .toList();
    }

    public boolean isVisitor(Conversation conversation) {
        return conversation != null && KIND_VISITOR.equalsIgnoreCase(conversation.kind());
    }

    public boolean isInteraction(Conversation conversation) {
        return conversation != null && KIND_INTERACTION.equalsIgnoreCase(conversation.kind());
    }

    /** Road visitors and sanctuary Interaction NPCs share the active-slot / cooldown roll pool. */
    public boolean isRollingEncounter(Conversation conversation) {
        return isVisitor(conversation) || isInteraction(conversation);
    }

    private Conversation normalize(Conversation value) {
        String kind = value.kind() == null || value.kind().isBlank()
                ? KIND_STORY : value.kind().trim().toUpperCase(Locale.ROOT);
        if (!KIND_STORY.equals(kind) && !KIND_VISITOR.equals(kind) && !KIND_INTERACTION.equals(kind)) {
            throw new IllegalArgumentException("Conversation " + value.id() + " has unknown kind " + value.kind());
        }
        List<ConversationChoice> choices = new ArrayList<>();
        for (ConversationChoice choice : safe(value.choices())) {
            choices.add(normalizeChoice(choice));
        }
        return new Conversation(
                value.id(), value.npcId(), value.npcName(), value.npcRole(), value.kicker(), value.prompt(),
                kind, Math.max(1, value.weight()), Math.max(1, value.cooldownHours() <= 0 ? 8 : value.cooldownHours()),
                Math.max(0, value.minStorehouseLevel()),
                List.copyOf(safe(value.requiresLoreIds())),
                List.copyOf(safe(value.requiresFlags())),
                value.oneTime(),
                List.copyOf(choices));
    }

    private ConversationChoice normalizeChoice(ConversationChoice value) {
        List<Outcome> outcomes = new ArrayList<>();
        int index = 0;
        for (Outcome outcome : safe(value.outcomes())) {
            String id = outcome.id() == null || outcome.id().isBlank() ? "outcome_" + (++index) : outcome.id();
            outcomes.add(new Outcome(
                    id, Math.max(1, outcome.weight()),
                    outcome.response() == null ? "" : outcome.response(),
                    outcome.relationshipDelta(),
                    blankToNull(outcome.flag()),
                    outcome.timberDelta(),
                    copyInts(outcome.materialDeltas()),
                    blankToNull(outcome.unlockLoreId())));
        }
        return new ConversationChoice(
                value.id(), value.label(), value.response(), value.relationshipDelta(), blankToNull(value.flag()),
                Math.max(0, value.timberCost()), copyInts(value.materialCosts()),
                value.timberDelta(), copyInts(value.materialDeltas()),
                blankToNull(value.unlockLoreId()), List.copyOf(outcomes));
    }

    private void validateReferences() {
        for (Conversation conversation : conversations.values()) {
            if (conversation.choices().isEmpty()) {
                throw new IllegalArgumentException("Conversation " + conversation.id() + " needs at least one choice.");
            }
            for (String loreId : conversation.requiresLoreIds()) {
                if (!entries.containsKey(loreId)) {
                    throw new IllegalArgumentException("Conversation " + conversation.id()
                            + " references unknown lore " + loreId + ".");
                }
            }
            for (ConversationChoice choice : conversation.choices()) {
                validateUnlock(conversation.id(), choice.unlockLoreId());
                for (Outcome outcome : choice.outcomes()) {
                    validateUnlock(conversation.id(), outcome.unlockLoreId());
                }
            }
        }
    }

    private void validateUnlock(String conversationId, String loreId) {
        if (loreId != null && !entries.containsKey(loreId)) {
            throw new IllegalArgumentException("Conversation " + conversationId
                    + " unlocks unknown lore " + loreId + ".");
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static Map<String, Integer> copyInts(Map<String, Integer> values) {
        Map<String, Integer> out = new LinkedHashMap<>();
        if (values != null) values.forEach((key, amount) -> {
            if (key != null && !key.isBlank() && amount != null && amount != 0) out.put(key, amount);
        });
        return Map.copyOf(out);
    }

    private static <T> void requireUnique(Map<String, T> target, String id, T value, String kind) {
        if (id == null || id.isBlank()) throw new IllegalArgumentException("Keep " + kind + " id is required.");
        if (target.putIfAbsent(id, value) != null) throw new IllegalArgumentException("Duplicate Keep " + kind + " id: " + id);
    }

    private static <T> List<T> safe(List<T> values) {
        return values == null ? List.of() : values;
    }
}
