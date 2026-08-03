package com.sieglings.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LoadingArtStorageServiceTest {

    @Test
    void normalizesLoadingArtPieceIdsWithoutOrientationSuffixCollisions() {
        assertEquals("ember-hollow", LoadingArtStorageService.normalizePieceId(" Ember Hollow!! "));
        assertEquals("ember", LoadingArtStorageService.normalizePieceId("ember-landscape"));
        assertEquals("ember", LoadingArtStorageService.normalizePieceId("ember-portrait"));
        assertNull(LoadingArtStorageService.normalizePieceId("   !!!   "));
    }

    @Test
    void resolvesSafeImageExtensionsForLoadingArtUploads() {
        assertEquals(
                "jpg",
                LoadingArtStorageService.resolveExtension(new MockMultipartFile(
                        "file",
                        "banner.JPEG",
                        "application/octet-stream",
                        new byte[] { 1 }
                ))
        );
        assertEquals(
                "webp",
                LoadingArtStorageService.resolveExtension(new MockMultipartFile(
                        "file",
                        "banner.bin",
                        "image/webp",
                        new byte[] { 1 }
                ))
        );
        assertThrows(
                IllegalArgumentException.class,
                () -> LoadingArtStorageService.resolveExtension(new MockMultipartFile(
                        "file",
                        "banner.svg",
                        "image/svg+xml",
                        new byte[] { 1 }
                ))
        );
    }

    @Test
    void buildsFirebaseStorageUrlsWhenDownloadTokensArePresent() {
        assertEquals(
                "token-a",
                LoadingArtStorageService.firstDownloadToken(Map.of("firebaseStorageDownloadTokens", " token-a,token-b "))
        );
        assertEquals(
                "https://firebasestorage.googleapis.com/v0/b/example.firebasestorage.app/o/img%2Fart%2Floading%2Fember-landscape.webp?alt=media&token=token-a",
                LoadingArtStorageService.buildStoragePublicUrl(
                        "example.firebasestorage.app",
                        "img/art/loading/ember-landscape.webp",
                        "token-a"
                )
        );
    }

    @Test
    void fallsBackToPublicStorageUrlWithoutDownloadToken() {
        assertEquals(
                "",
                LoadingArtStorageService.firstDownloadToken(Map.of())
        );
        assertEquals(
                "https://storage.googleapis.com/example.firebasestorage.app/img/art/loading/ember%20hollow-landscape.png",
                LoadingArtStorageService.buildStoragePublicUrl(
                        "example.firebasestorage.app",
                        "img/art/loading/ember hollow-landscape.png",
                        ""
                )
        );
    }

    @Test
    void hostedUploadsFailClosedWhenCloudStorageCannotInitialize() throws IOException {
        Path invalidServiceAccount = Files.createTempFile("loading-art-storage", ".json");
        Files.writeString(invalidServiceAccount, "{not-json");
        String pieceId = "hosted-storage-failure-" + UUID.randomUUID();
        Path localTarget = Path.of("src", "main", "resources", "static", "img", "art", "loading",
                pieceId + "-landscape.png").toAbsolutePath().normalize();
        Files.deleteIfExists(localTarget);
        LoadingArtStorageService service = new LoadingArtStorageService(
                new ObjectMapper(),
                true,
                "example.firebasestorage.app",
                "example-project",
                invalidServiceAccount.toString(),
                true
        );

        IOException exception = assertThrows(
                IOException.class,
                () -> service.saveLoadingArt(
                        pieceId,
                        "landscape",
                        new MockMultipartFile("file", "banner.png", "image/png", new byte[] { 1 })
                )
        );

        assertTrue(exception.getMessage().startsWith(
                "Cloud loading art storage is unavailable; refusing to save to ephemeral local disk."
        ));
        assertFalse(Files.exists(localTarget));
        Files.deleteIfExists(invalidServiceAccount);
    }
}
