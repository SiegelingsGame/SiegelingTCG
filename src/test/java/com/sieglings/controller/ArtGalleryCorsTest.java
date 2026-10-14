package com.sieglings.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.config.WebConfig;
import com.sieglings.service.ArtCardTagService;
import com.sieglings.service.CardEditorAuthService;
import com.sieglings.service.CardOverrideStorageService;
import com.sieglings.service.GalleryRewardService;
import com.sieglings.service.LoadingArtStorageService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.PropertySource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockServletContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Exercises MVC's origin checks, which direct controller calls and fetch mocks bypass. */
class ArtGalleryCorsTest {
    private static final String URL = "/api/art/tags/aerovane";
    private static final String HOSTING = "https://siegelingstcgtesting.web.app";
    private AnnotationConfigWebApplicationContext context;
    private MockMvc mvc;
    private CardEditorAuthService auth;
    private ArtCardTagService tags;
    @TempDir Path artDirectory;

    @BeforeEach
    void setUp() {
        context = new AnnotationConfigWebApplicationContext();
        context.setServletContext(new MockServletContext());
        context.register(MvcConfig.class);
        context.refresh();
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
        auth = context.getBean(CardEditorAuthService.class);
        tags = context.getBean(ArtCardTagService.class);
        when(context.getBean(CardOverrideStorageService.class).isFirestoreReady()).thenReturn(true);
        when(auth.requireEditor("editor-token"))
                .thenReturn(new CardEditorAuthService.EditorIdentity("editor@example.com", "Editor"));
        when(auth.requireEditor(null)).thenThrow(new IllegalArgumentException("Sign in to publish live card data."));
        LoadingArtStorageService art = context.getBean(LoadingArtStorageService.class);
        when(art.getArtDirectory()).thenReturn(artDirectory);
        when(art.getGalleryDirectory()).thenReturn(artDirectory);
        when(art.listHostedArtUrls()).thenReturn(Map.of("aerovane-landscape.webp", "/img/art/loading/aerovane-landscape.webp"));
    }

    @AfterEach
    void tearDown() {
        context.close();
    }

    @ParameterizedTest
    @ValueSource(strings = {HOSTING, "https://siegelingstcgtesting.firebaseapp.com", "http://localhost:8081"})
    void browserCanPreflightTagSave(String origin) throws Exception {
        mvc.perform(options(URL).header("Origin", origin)
                        .header("Access-Control-Request-Method", "PUT")
                        .header("Access-Control-Request-Headers", "content-type,x-card-editor-token,x-card-editor-gate"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", origin))
                .andExpect(header().string("Access-Control-Allow-Methods", containsString("PUT")))
                .andExpect(header().string("Access-Control-Allow-Headers", containsString("x-card-editor-token")));
        verifyNoInteractions(auth, tags);
    }

    @ParameterizedTest
    @ValueSource(strings = {HOSTING, "https://siegelingstcgtesting.firebaseapp.com"})
    void browserOriginReachesAuthenticatedAerovaneSave(String origin) throws Exception {
        ArtCardTagService.ArtTag saved = new ArtCardTagService.ArtTag(List.of("aerovane"), List.of(), "");
        when(tags.save(eq("aerovane"), anyMap(), eq("editor@example.com"))).thenReturn(saved);
        mvc.perform(put(URL).accept(MediaType.APPLICATION_JSON).header("Origin", origin)
                        .header("X-Card-Editor-Token", "editor-token")
                        .header("X-Card-Editor-Gate", "gate-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"cards\":[\"aerovane\"],\"shop\":[],\"focus\":\"\"}"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", origin))
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.cards[0]").value("aerovane"));
        verify(tags).save("aerovane", Map.of("cards", List.of("aerovane"), "shop", List.of(), "focus", ""), "editor@example.com");
    }

    @Test
    void browserWithoutEditorTokenStillCannotSave() throws Exception {
        mvc.perform(put(URL).accept(MediaType.APPLICATION_JSON).header("Origin", HOSTING)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Sign in to publish live card data."));
        verifyNoInteractions(tags);
    }

    @Test
    void untrustedOriginIsStillRejectedBeforeSaving() throws Exception {
        mvc.perform(put(URL).header("Origin", "https://untrusted.example")
                        .header("X-Card-Editor-Token", "editor-token")
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(auth, tags);
    }

    @Configuration
    @EnableWebMvc
    @Import({WebConfig.class, ArtGalleryController.class})
    @PropertySource("classpath:application.properties")
    static class MvcConfig {
        @Bean ObjectMapper objectMapper() { return new ObjectMapper(); }
        @Bean LoadingArtStorageService loadingArtStorageService() { return mock(LoadingArtStorageService.class); }
        @Bean CardOverrideStorageService storageService() { return mock(CardOverrideStorageService.class); }
        @Bean CardEditorAuthService authService() { return mock(CardEditorAuthService.class); }
        @Bean GalleryRewardService galleryRewardService() { return mock(GalleryRewardService.class); }
        @Bean ArtCardTagService artCardTagService() { return mock(ArtCardTagService.class); }
    }
}
