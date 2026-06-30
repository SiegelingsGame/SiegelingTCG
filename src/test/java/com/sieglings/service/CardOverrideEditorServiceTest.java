package com.sieglings.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CardOverrideEditorServiceTest {

    @Test
    void liveSaveRejectsStaleCatalogVersionBeforeWritingSnapshots() {
        ObjectMapper objectMapper = new ObjectMapper();
        CardOverrideStorageService storageService = mock(CardOverrideStorageService.class);
        CardEditorAuthService authService = mock(CardEditorAuthService.class);
        CardOverrideEditorService service = new CardOverrideEditorService(
                objectMapper,
                storageService,
                null,
                null,
                authService,
                null,
                null,
                null,
                null,
                null
        );
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("catalogVersion", 4L);

        when(storageService.isFirestoreReady()).thenReturn(true);
        when(storageService.getCatalogRevision()).thenReturn(5L);
        when(authService.requireEditor("token")).thenReturn(new CardEditorAuthService.EditorIdentity("editor@example.com", "Editor"));

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> service.saveEditorState(payload, "token")
        );

        assertEquals("The live catalog changed since this dashboard loaded. Reload the latest data before publishing.", ex.getMessage());
        verify(storageService, never()).saveSnapshot(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }
}
