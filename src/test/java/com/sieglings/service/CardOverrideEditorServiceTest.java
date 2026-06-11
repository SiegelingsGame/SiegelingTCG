package com.sieglings.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CardOverrideEditorServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final CardOverrideStorageService storageService = mock(CardOverrideStorageService.class);
    private final CardArtStorageService cardArtStorageService = mock(CardArtStorageService.class);
    private final CardOverrideEditorService editorService = new CardOverrideEditorService(
            objectMapper,
            storageService,
            mock(PresetDeckCatalogService.class),
            mock(TrainerCatalogService.class),
            new CardEditorAuthService(storageService, "admins", "sessions", 30),
            mock(CardDefinitionService.class),
            mock(LiveElementCatalogService.class),
            mock(MovesPoolService.class),
            mock(PackCatalogService.class),
            cardArtStorageService
    );

    @Test
    void saveEditorStateRequiresEditorAuthEvenWhenFirestoreIsUnavailable() {
        when(storageService.isFirestoreReady()).thenReturn(false);

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> editorService.saveEditorState(objectMapper.createObjectNode(), null)
        );

        assertEquals("Sign in to publish live card data.", ex.getMessage());
        verify(storageService, never()).loadSnapshot();
        verify(storageService, never()).saveSnapshot(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void uploadCardArtRequiresEditorAuthEvenWhenFirestoreIsUnavailable() throws Exception {
        when(storageService.isFirestoreReady()).thenReturn(false);
        MockMultipartFile file = new MockMultipartFile("file", "card.png", "image/png", new byte[] {1});

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> editorService.uploadCardArt("staticap", file, null)
        );

        assertEquals("Sign in to publish live card data.", ex.getMessage());
        verify(cardArtStorageService, never()).saveCardArt(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }
}
