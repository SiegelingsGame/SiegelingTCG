package com.sieglings.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CardArtStorageServiceTest {

    @Test
    void holographicUploadsUseASeparateObjectName() {
        assertEquals("bearby.png", CardArtStorageService.buildFileName("bearby", "png", "STANDARD"));
        assertEquals("bearby-holographic.png", CardArtStorageService.buildFileName("bearby", "png", "HOLOGRAPHIC"));
    }
}
