package com.sieglings.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final List<String> allowedOriginPatterns;

    public WebConfig(@Value("${app.cors.allowed-origin-patterns:http://localhost:*,http://127.0.0.1:*}") String allowedOriginPatterns) {
        this.allowedOriginPatterns = Arrays.stream(allowedOriginPatterns.split(","))
                .map(String::trim)
                .filter(pattern -> !pattern.isEmpty())
                .toList();
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns(allowedOriginPatterns.toArray(String[]::new))
                .allowedMethods("GET", "POST", "OPTIONS")
                .allowedHeaders("*")
                // Allow the session cookie to ride cross-origin dev requests. Safe
                // with allowedOriginPatterns (never "*"); same-origin prod is
                // unaffected.
                .allowCredentials(true)
                .maxAge(3600);
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Path uploadedCardArtDir = Path.of("src", "main", "resources", "static", "assets", "cards")
                .toAbsolutePath()
                .normalize();
        registry.addResourceHandler("/assets/cards/**")
                .addResourceLocations(
                        "classpath:/static/assets/cards/",
                        "file:" + uploadedCardArtDir + "/"
                );
        Path uploadedLoadingArtDir = Path.of("src", "main", "resources", "static", "img", "art", "loading")
                .toAbsolutePath()
                .normalize();
        registry.addResourceHandler("/img/art/loading/**")
                .addResourceLocations(
                        "classpath:/static/img/art/loading/",
                        "file:" + uploadedLoadingArtDir + "/"
                );
    }

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addRedirectViewController("/", "/landing");
        registry.addViewController("/landing").setViewName("forward:/landing.html");

        // ---- The art-first hub owns the primary routes. It reads the path to
        // pick its screen, so one page answers all of them.
        registry.addViewController("/home").setViewName("forward:/home-next.html");
        registry.addViewController("/cards").setViewName("forward:/home-next.html");
        registry.addViewController("/decks").setViewName("forward:/home-next.html");
        registry.addViewController("/deck-builder").setViewName("forward:/home-next.html");
        registry.addViewController("/shop").setViewName("forward:/home-next.html");
        registry.addViewController("/shop/cardpack").setViewName("forward:/home-next.html");
        registry.addViewController("/profile").setViewName("forward:/home-next.html");
        registry.addViewController("/profile/**").setViewName("forward:/home-next.html");
        registry.addViewController("/achievements").setViewName("forward:/home-next.html");
        registry.addViewController("/achievements/**").setViewName("forward:/home-next.html");
        registry.addViewController("/social").setViewName("forward:/home-next.html");
        registry.addViewController("/settings").setViewName("forward:/home-next.html");
        registry.addViewController("/help").setViewName("forward:/home-next.html");
        registry.addViewController("/next").setViewName("forward:/home-next.html");

        // ---- Legacy hub: every route the old home.html owned, under /legacy/*.
        // home.js reads the prefix and keeps its own links inside it, so a player
        // who opens the legacy hub stays there instead of being bounced mid-session.
        registry.addViewController("/legacy").setViewName("forward:/home.html");
        registry.addViewController("/legacy/home").setViewName("forward:/home.html");
        registry.addViewController("/legacy/cards").setViewName("forward:/home.html");
        registry.addViewController("/legacy/decks").setViewName("forward:/home.html");
        registry.addViewController("/legacy/deck-builder").setViewName("forward:/home.html");
        registry.addViewController("/legacy/social").setViewName("forward:/home.html");
        registry.addViewController("/legacy/social/**").setViewName("forward:/home.html");
        registry.addViewController("/legacy/lobbies").setViewName("forward:/home.html");
        registry.addViewController("/legacy/profile").setViewName("forward:/home.html");
        registry.addViewController("/legacy/profile/**").setViewName("forward:/home.html");
        registry.addViewController("/legacy/achievements").setViewName("forward:/home.html");
        registry.addViewController("/legacy/achievements/**").setViewName("forward:/home.html");
        registry.addViewController("/legacy/shop").setViewName("forward:/home.html");
        registry.addViewController("/legacy/shop/cardpack").setViewName("forward:/home.html");
        registry.addViewController("/legacy/help").setViewName("forward:/help.html");

        // ---- Still the legacy hub's job: it owns the sign-in forms and the
        // live lobby screens, which the new design does not host yet.
        registry.addViewController("/login").setViewName("forward:/home.html");
        registry.addViewController("/lobbies").setViewName("forward:/home.html");
        registry.addViewController("/social/lobby/**").setViewName("forward:/home.html");

        // ---- Gameplay is unchanged.
        registry.addViewController("/play").setViewName("forward:/play.html");
        // Same page, but the hub's Battle button lands here so the player skips
        // the welcome/mode screen and arrives on the loadout itself. game.js
        // reads the path; /play keeps its existing welcome behaviour.
        registry.addViewController("/battle").setViewName("forward:/play.html");
        registry.addViewController("/siege").setViewName("forward:/adventure.html");
        registry.addViewController("/keep").setViewName("forward:/keep.html");

        registry.addRedirectViewController("/card_dashboard", "/card-dashboard.html");
        registry.addRedirectViewController("/card-dashboard", "/card-dashboard.html");
    }
}
