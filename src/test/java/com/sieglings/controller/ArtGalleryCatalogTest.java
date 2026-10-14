package com.sieglings.controller;

import com.sieglings.service.ArtCardTagService;
import com.sieglings.service.LoadingArtStorageService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockServletContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Renamed and removed pieces as the game and the dashboard each read the catalog. */
class ArtGalleryCatalogTest {
    private AnnotationConfigWebApplicationContext context;
    private MockMvc mvc;
    @TempDir Path artDirectory;

    @BeforeEach
    void setUp() {
        context = new AnnotationConfigWebApplicationContext();
        context.setServletContext(new MockServletContext());
        context.register(ArtGalleryCorsTest.MvcConfig.class);
        context.refresh();
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        LoadingArtStorageService art = context.getBean(LoadingArtStorageService.class);
        when(art.getArtDirectory()).thenReturn(artDirectory);
        when(art.getGalleryDirectory()).thenReturn(artDirectory);
        when(art.listHostedArtUrls()).thenReturn(Map.of(
                "aerovane-landscape.webp", "/img/art/loading/aerovane-landscape.webp",
                "sky-landscape.webp", "/img/art/loading/sky-landscape.webp"));
        ArtCardTagService tags = context.getBean(ArtCardTagService.class);
        when(tags.tags()).thenReturn(Map.of(
                "aerovane", new ArtCardTagService.ArtTag(List.of("aerovane"), List.of(), "", "Skyward Coil", "The Drifting Isles", false),
                "sky", new ArtCardTagService.ArtTag(List.of(), List.of(), "", "", "", true),
                // A compiled-in scene with no file listed still has to be named as removed.
                "bearby-blastoff", new ArtCardTagService.ArtTag(List.of(), List.of(), "", "", "", true)));
    }

    @AfterEach
    void tearDown() {
        context.close();
    }

    @Test
    void theGameSeesTheNewNameAndNotTheRemovedPiece() throws Exception {
        mvc.perform(get("/api/art/loading").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.art[?(@.id=='aerovane')].title").value("Skyward Coil"))
                .andExpect(jsonPath("$.art[?(@.id=='aerovane')].place").value("The Drifting Isles"))
                .andExpect(jsonPath("$.art[?(@.id=='aerovane')].defaultTitle").value("Aerovane"))
                .andExpect(jsonPath("$.art[*].id", not(hasItem("sky"))))
                .andExpect(jsonPath("$.removed", hasItem("sky")))
                .andExpect(jsonPath("$.removed", hasItem("bearby-blastoff")));
    }

    @Test
    void theDashboardStillListsRemovedPiecesSoTheyCanBeRestored() throws Exception {
        mvc.perform(get("/api/art/loading").param("all", "true").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.art[?(@.id=='sky')].hidden").value(true))
                .andExpect(jsonPath("$.art[?(@.id=='aerovane')].hidden").value(false));
    }
}
