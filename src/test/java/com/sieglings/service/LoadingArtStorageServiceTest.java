package com.sieglings.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.api.gax.paging.Page;
import com.google.cloud.storage.Blob;
import com.google.cloud.storage.Storage;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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

    @Test
    void savesCinematicGalleryArtLocallyWithThumbSibling() throws IOException {
        String pieceId = "cinematic-local-" + UUID.randomUUID();
        Path galleryDir = Path.of("src", "main", "resources", "static", "img", "gallery").toAbsolutePath().normalize();
        Path full = galleryDir.resolve(pieceId + ".webp");
        Path thumb = galleryDir.resolve(pieceId + "-thumb.webp");
        Files.deleteIfExists(full);
        Files.deleteIfExists(thumb);

        LoadingArtStorageService service = new LoadingArtStorageService(
                new ObjectMapper(),
                false,
                "",
                "",
                "",
                false
        );
        String url = service.saveCinematicGalleryArt(
                pieceId,
                new MockMultipartFile("file", "scene.webp", "image/webp", new byte[] { 9, 8, 7 })
        );

        assertEquals("/img/gallery/" + pieceId + ".webp", url);
        assertTrue(Files.isRegularFile(full));
        assertTrue(Files.isRegularFile(thumb));
        Files.deleteIfExists(full);
        Files.deleteIfExists(thumb);
    }

    @Test
    void hostedArtListingIsCachedUntilTheTtlLapses() {
        Storage storage = storageListing("img/art/loading/ember-landscape.webp");
        LoadingArtStorageService service = cloudService(storage);
        MutableClock clock = new MutableClock();
        service.setClock(clock);

        Map<String, String> first = service.listHostedArtUrls();
        Map<String, String> second = service.listHostedArtUrls();

        assertTrue(first.containsKey("ember-landscape.webp"));
        assertEquals(first, second);
        // One listing = the loading prefix plus the gallery prefix.
        verify(storage, times(2)).list(anyString(), any(Storage.BlobListOption.class));

        clock.advanceSeconds(LoadingArtStorageService.HOSTED_LISTING_TTL.getSeconds() + 1);
        service.listHostedArtUrls();
        verify(storage, times(4)).list(anyString(), any(Storage.BlobListOption.class));
    }

    @Test
    void uploadingHostedArtInvalidatesTheCachedListing() throws IOException {
        Storage storage = storageListing("img/art/loading/ember-landscape.webp");
        LoadingArtStorageService service = cloudService(storage);
        service.setClock(new MutableClock());

        service.listHostedArtUrls();
        service.saveLoadingArt("ember", "portrait",
                new MockMultipartFile("file", "ember.webp", "image/webp", new byte[] { 1, 2, 3 }));
        // listing (2) + the upload's stale-variant sweep (1)
        verify(storage, times(3)).list(anyString(), any(Storage.BlobListOption.class));

        service.listHostedArtUrls();
        verify(storage, times(5)).list(anyString(), any(Storage.BlobListOption.class));
    }

    @Test
    void aPartiallyFailedListingIsNotCached() {
        Storage storage = mock(Storage.class);
        when(storage.list(anyString(), any(Storage.BlobListOption.class)))
                .thenThrow(new RuntimeException("transient"));
        LoadingArtStorageService service = cloudService(storage);
        service.setClock(new MutableClock());

        assertTrue(service.listHostedArtUrls().isEmpty());
        service.listHostedArtUrls();
        verify(storage, times(4)).list(anyString(), any(Storage.BlobListOption.class));
    }

    private static LoadingArtStorageService cloudService(Storage storage) {
        LoadingArtStorageService service = new LoadingArtStorageService(
                new ObjectMapper(), true, "test-bucket", "", "", true);
        service.useStorageClient(storage, "test-bucket");
        return service;
    }

    @SuppressWarnings("unchecked")
    private static Storage storageListing(String objectName) {
        Blob blob = mock(Blob.class);
        when(blob.getName()).thenReturn(objectName);
        when(blob.isDirectory()).thenReturn(false);
        when(blob.getMetadata()).thenReturn(Map.of("firebaseStorageDownloadTokens", "token"));
        Page<Blob> page = mock(Page.class);
        when(page.iterateAll()).thenReturn(List.of(blob));
        Storage storage = mock(Storage.class);
        when(storage.list(anyString(), any(Storage.BlobListOption.class))).thenReturn(page);
        return storage;
    }

    private static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-10-01T00:00:00Z");

        void advanceSeconds(long seconds) {
            now = now.plusSeconds(seconds);
        }

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
