package com.sieglings.staticassets;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BattlefieldSkinRenderingRegressionTest {
    private static final Path ROOT = Path.of("src/main/resources/static");

    @Test
    void eachManifestBoardAndLazyShopThumbnailIsPackagedAsWebp() throws Exception {
        Map<?, ?> manifest = new ObjectMapper().readValue(
                ROOT.resolve("img/board-skins/manifest.json").toFile(), Map.class);
        var skins = (java.util.List<Map<String, Object>>) manifest.get("skins");
        assertEquals(17, skins.size());
        for (Map<String, Object> skin : skins) {
            Path full = ROOT.resolve(String.valueOf(skin.get("assetUrl")).replaceFirst("^/", ""));
            Path thumb = ROOT.resolve(String.valueOf(skin.get("thumbnailUrl")).replaceFirst("^/", ""));
            assertTrue(Files.isRegularFile(full), "Missing artwork for " + skin.get("id"));
            assertTrue(Files.isRegularFile(thumb), "Missing thumbnail for " + skin.get("id"));
            assertTrue(Files.size(full) > 10_000, "Unexpectedly empty WebP asset: " + full);
            assertTrue(Files.readString(ROOT.resolve("js/home.js")).contains("loading=\"lazy\" decoding=\"async\""));
        }
    }

    @Test
    void localAndOpponentSkinsMapToTheirOwnBoardHalvesAndAiStaysNeutral() throws Exception {
        String game = Files.readString(ROOT.resolve("js/game.js"));
        String controller = Files.readString(Path.of("src/main/java/com/sieglings/controller/GameController.java"));
        String multiplayer = Files.readString(Path.of("src/main/java/com/sieglings/service/MultiplayerService.java"));
        String markup = Files.readString(ROOT.resolve("play.html"));
        assertTrue(game.contains("player?.battlefieldSkinId"));
        assertTrue(game.contains("applySide('.bf-player', gameState?.player"));
        assertTrue(game.contains("applySide('.bf-enemy', gameState?.enemy"));
        assertTrue(game.contains("selector === '.bf-enemy' && !gameState?.multiplayer"));
        assertTrue(controller.contains("info.put(\"battlefieldSkinId\", player.getBattlefieldSkinId())"));
        assertTrue(multiplayer.contains("attachBattlefieldSkins(gameState, room)"));
        assertTrue(markup.contains("id=\"playerGrid\"") && markup.contains("id=\"enemyGrid\""));
        assertEquals(2, markup.split("class=\"bf-skin-layer\"", -1).length - 1);
    }

    @Test
    void shopPreviewUsesResponsiveArtworkWithoutBlockingBoardHitboxes() throws Exception {
        String home = Files.readString(ROOT.resolve("js/home.js"));
        String homeCss = Files.readString(ROOT.resolve("css/home.css"));
        String boardCss = Files.readString(ROOT.resolve("css/style.css"));
        assertTrue(home.contains("data-battlefield-preview-id"));
        assertTrue(home.contains("skin.artwork || skin.assetUrl"));
        assertTrue(homeCss.contains("@media (max-width: 420px)"));
        assertTrue(homeCss.contains("object-fit: cover"));
        assertTrue(boardCss.contains("pointer-events: none;"));
        assertFalse(homeCss.contains(".battlefield-skin-preview img { pointer-events: auto"));
    }
}
