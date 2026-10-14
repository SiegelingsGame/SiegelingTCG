package com.sieglings.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.api.core.ApiFutures;
import com.google.cloud.firestore.CollectionReference;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.WriteResult;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ArtCardTagServiceTest {

    @Test
    void baselineSeedsTheShippedScenes() {
        CardOverrideStorageService storage = mock(CardOverrideStorageService.class);
        when(storage.isFirestoreReady()).thenReturn(false);
        ArtCardTagService service = new ArtCardTagService(new ObjectMapper(), storage, "appConfig", "artCardTags");

        ArtCardTagService.ArtTag draco = service.tagFor("Draco-Brood");
        assertEquals(List.of("draco"), draco.cards());
        assertEquals(List.of("element:FIRE"), draco.shop());
        assertEquals("50% 45%", draco.focus());
        assertNull(service.tagFor("no-such-piece"));
    }

    @Test
    void parseNormalisesSlotsAndRejectsUnsafeValues() {
        ArtCardTagService.ArtTag tag = ArtCardTagService.parseTag(Map.of(
                "cards", List.of(" draco ", "draco", "", "new-siegeknight-3"),
                "shop", List.of("Element:fire", "summon:ice", "pack:pack_Molten_Forge"),
                "focus", "40%   60%"));
        assertEquals(List.of("draco", "new-siegeknight-3"), tag.cards());
        assertEquals(List.of("element:FIRE", "summon:ICE", "pack:pack_Molten_Forge"), tag.shop());
        assertEquals("40% 60%", tag.focus());

        assertThrows(IllegalArgumentException.class,
                () -> ArtCardTagService.parseTag(Map.of("focus", "50% 50%; background:url(x)")));
        assertThrows(IllegalArgumentException.class,
                () -> ArtCardTagService.parseTag(Map.of("shop", List.of("banner:FIRE"))));
        assertThrows(IllegalArgumentException.class,
                () -> ArtCardTagService.parseTag(Map.of("cards", List.of("<script>"))));
        assertThrows(IllegalArgumentException.class,
                () -> ArtCardTagService.parseTag(Map.of("cards", "draco")));
        List<String> tooMany = new ArrayList<>();
        for (int i = 0; i <= ArtCardTagService.MAX_CARDS; i++) {
            tooMany.add("card-" + i);
        }
        assertThrows(IllegalArgumentException.class,
                () -> ArtCardTagService.parseTag(Map.of("cards", tooMany)));
    }

    @Test
    @SuppressWarnings("unchecked")
    void firestoreEditsReplaceTheBaselinePieceByPieceAndAClearStaysCleared() {
        CardOverrideStorageService storage = mock(CardOverrideStorageService.class);
        Firestore firestore = mock(Firestore.class);
        CollectionReference collection = mock(CollectionReference.class);
        DocumentReference doc = mock(DocumentReference.class);
        DocumentSnapshot snapshot = mock(DocumentSnapshot.class);
        when(storage.isFirestoreReady()).thenReturn(true);
        when(storage.requireFirestore()).thenReturn(firestore);
        when(firestore.collection("appConfig")).thenReturn(collection);
        when(collection.document("artCardTags")).thenReturn(doc);
        when(doc.get()).thenReturn(ApiFutures.immediateFuture(snapshot));
        when(snapshot.exists()).thenReturn(true);
        when(snapshot.get("pieces")).thenReturn(Map.of(
                "frostag-training", Map.of("cards", List.of("frostag", "glaciemperor"), "shop", List.of(), "focus", "")));
        when(doc.set(any(Map.class))).thenReturn(ApiFutures.immediateFuture(mock(WriteResult.class)));

        ArtCardTagService service = new ArtCardTagService(new ObjectMapper(), storage, "appConfig", "artCardTags");
        assertEquals(List.of("frostag", "glaciemperor"), service.tagFor("frostag-training").cards());
        // Untouched seeded pieces keep their baseline tag.
        assertEquals(List.of("draco"), service.tagFor("draco-brood").cards());

        service.save("draco-brood", Map.of("cards", List.of(), "shop", List.of(), "focus", ""), "Editor@Example.com");
        assertNull(service.tagFor("draco-brood"));
        assertFalse(service.tags().containsKey("draco-brood"));

        ArgumentCaptor<Map<String, Object>> written = ArgumentCaptor.forClass(Map.class);
        verify(doc).set(written.capture());
        Map<String, Object> pieces = (Map<String, Object>) written.getValue().get("pieces");
        assertTrue(pieces.containsKey("draco-brood"), "the clear is stored so the seed does not come back");
        assertTrue(pieces.containsKey("frostag-training"), "other edits survive a save");
        assertEquals("editor@example.com", written.getValue().get("updatedBy"));
    }

    @Test
    void renameAndRemoveKeepTheTagsAndASaveOnlyChangesWhatItSends() {
        CardOverrideStorageService storage = mock(CardOverrideStorageService.class);
        when(storage.isFirestoreReady()).thenReturn(false);
        ArtCardTagService service = new ArtCardTagService(new ObjectMapper(), storage, "appConfig", "artCardTags");
        ArtCardTagService.ArtTag renamed = ArtCardTagService.parseTag(Map.of(
                "title", "  Skyward   Coil ", "place", "The Drifting Isles", "hidden", true));
        assertEquals("Skyward Coil", renamed.title());
        assertEquals("The Drifting Isles", renamed.place());
        assertTrue(renamed.hidden());
        assertFalse(renamed.isEmpty(), "a rename or a removal alone is worth storing");
        assertFalse(ArtCardTagService.parseTag(Map.of("hidden", "false")).hidden());
        assertThrows(IllegalArgumentException.class,
                () -> ArtCardTagService.parseTag(Map.of("title", "x".repeat(ArtCardTagService.MAX_NAME_LENGTH + 1))));

        // The three-field form the tag editor has always used still builds.
        ArtCardTagService.ArtTag legacy = new ArtCardTagService.ArtTag(List.of("draco"), List.of(), "");
        assertEquals("", legacy.title());
        assertFalse(legacy.hidden());
        assertTrue(service.tagFor("draco-brood") != null);
        assertEquals(List.of("draco"), service.tagFor("draco-brood").cards());
    }

    @Test
    @SuppressWarnings("unchecked")
    void aRenameKeepsTheCardsAndARemovalKeepsTheName() {
        CardOverrideStorageService storage = mock(CardOverrideStorageService.class);
        Firestore firestore = mock(Firestore.class);
        CollectionReference collection = mock(CollectionReference.class);
        DocumentReference doc = mock(DocumentReference.class);
        DocumentSnapshot snapshot = mock(DocumentSnapshot.class);
        when(storage.isFirestoreReady()).thenReturn(true);
        when(storage.requireFirestore()).thenReturn(firestore);
        when(firestore.collection("appConfig")).thenReturn(collection);
        when(collection.document("artCardTags")).thenReturn(doc);
        when(doc.get()).thenReturn(ApiFutures.immediateFuture(snapshot));
        when(snapshot.exists()).thenReturn(false);
        when(doc.set(any(Map.class))).thenReturn(ApiFutures.immediateFuture(mock(WriteResult.class)));
        ArtCardTagService service = new ArtCardTagService(new ObjectMapper(), storage, "appConfig", "artCardTags");

        service.save("draco-brood", Map.of("title", "Cinder Brood"), "editor@example.com");
        ArtCardTagService.ArtTag afterRename = service.tagFor("draco-brood");
        assertEquals("Cinder Brood", afterRename.title());
        assertEquals(List.of("draco"), afterRename.cards(), "renaming does not drop the seeded cards");
        assertEquals("50% 45%", afterRename.focus());

        service.save("draco-brood", Map.of("hidden", true), "editor@example.com");
        ArtCardTagService.ArtTag afterRemove = service.tagFor("draco-brood");
        assertTrue(afterRemove.hidden());
        assertEquals("Cinder Brood", afterRemove.title(), "removing keeps the name for a restore");

        service.save("draco-brood", Map.of("hidden", false, "title", ""), "editor@example.com");
        ArtCardTagService.ArtTag restored = service.tagFor("draco-brood");
        assertFalse(restored.hidden());
        assertEquals("", restored.title(), "an empty name goes back to the file's");

        ArgumentCaptor<Map<String, Object>> written = ArgumentCaptor.forClass(Map.class);
        verify(doc, org.mockito.Mockito.atLeastOnce()).set(written.capture());
        Map<String, Object> piece = (Map<String, Object>) ((Map<String, Object>) written.getValue().get("pieces")).get("draco-brood");
        assertEquals(false, piece.get("hidden"));
        assertEquals(List.of("draco"), piece.get("cards"));
    }
}
