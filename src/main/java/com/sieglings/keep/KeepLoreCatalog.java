package com.sieglings.keep;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Versioned narrative content for discoveries and conversations in My Keep. */
@Component
public class KeepLoreCatalog {
    public record LoreEntry(String id, String type, String title, String source, String perspective,
                            String era, String summary, String body, String artKey) { }
    public record ConversationChoice(String id, String label, String response, int relationshipDelta, String flag) { }
    public record Conversation(String id, String npcId, String npcName, String npcRole, String kicker,
                               String prompt, List<String> requiresLoreIds, List<ConversationChoice> choices) { }
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

    private Conversation normalize(Conversation value) {
        return new Conversation(value.id(), value.npcId(), value.npcName(), value.npcRole(), value.kicker(),
                value.prompt(), List.copyOf(safe(value.requiresLoreIds())), List.copyOf(safe(value.choices())));
    }

    private void validateReferences() {
        for (Conversation conversation : conversations.values()) {
            if (conversation.choices().isEmpty()) {
                throw new IllegalArgumentException("Conversation " + conversation.id() + " needs at least one choice.");
            }
            for (String loreId : conversation.requiresLoreIds()) {
                if (!entries.containsKey(loreId)) {
                    throw new IllegalArgumentException("Conversation " + conversation.id() + " references unknown lore " + loreId + ".");
                }
            }
        }
    }

    private static <T> void requireUnique(Map<String, T> target, String id, T value, String kind) {
        if (id == null || id.isBlank()) throw new IllegalArgumentException("Keep " + kind + " id is required.");
        if (target.putIfAbsent(id, value) != null) throw new IllegalArgumentException("Duplicate Keep " + kind + " id: " + id);
    }

    private static <T> List<T> safe(List<T> values) {
        return values == null ? List.of() : values;
    }
}
