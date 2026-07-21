package com.sieglings.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CardArtStorageServiceTest {

    @Test
    void holographicUploadsUseASeparateObjectName() {
        assertEquals("bearby.png", CardArtStorageService.buildFileName("bearby", "png", "STANDARD"));
        assertEquals("bearby-holographic.png", CardArtStorageService.buildFileName("bearby", "png", "HOLOGRAPHIC"));
    }

    @Test
    void hostedHolographicUploadsUseAResolvableFirebaseStorageObjectUrl() {
        String fileName = CardArtStorageService.buildFileName("bearzooka", "png", "HOLOGRAPHIC");
        String objectPath = CardArtStorageService.buildStorageObjectPath(fileName);
        String url = LoadingArtStorageService.buildStoragePublicUrl(
                "example.firebasestorage.app",
                objectPath,
                "download-token"
        );

        assertEquals("assets/cards/bearzooka-holographic.png", objectPath);
        assertTrue(url.startsWith(
                "https://firebasestorage.googleapis.com/v0/b/example.firebasestorage.app/o/"
                        + "assets%2Fcards%2Fbearzooka-holographic.png?alt=media&token="
        ));
        assertTrue(url.endsWith("download-token"));
        assertEquals("image/png", CardArtStorageService.contentTypeForExtension("png"));
        assertEquals("image/svg+xml", CardArtStorageService.contentTypeForExtension("svg"));
    }
}
