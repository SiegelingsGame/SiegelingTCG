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
        registry.addViewController("/home").setViewName("forward:/home.html");
        registry.addViewController("/cards").setViewName("forward:/home.html");
        registry.addViewController("/decks").setViewName("forward:/home.html");
        registry.addViewController("/deck-builder").setViewName("forward:/home.html");
        registry.addViewController("/lobbies").setViewName("forward:/home.html");
        registry.addViewController("/social").setViewName("forward:/home.html");
        registry.addViewController("/social/lobby/**").setViewName("forward:/home.html");
        registry.addViewController("/profile").setViewName("forward:/home.html");
        registry.addViewController("/profile/**").setViewName("forward:/home.html");
        registry.addViewController("/achievements").setViewName("forward:/home.html");
        registry.addViewController("/achievements/**").setViewName("forward:/home.html");
        registry.addViewController("/shop").setViewName("forward:/home.html");
        registry.addViewController("/shop/cardpack").setViewName("forward:/home.html");
        registry.addViewController("/login").setViewName("forward:/home.html");
        registry.addViewController("/play").setViewName("forward:/play.html");
        registry.addViewController("/siege").setViewName("forward:/adventure.html");
        registry.addViewController("/keep").setViewName("forward:/keep.html");
        registry.addViewController("/help").setViewName("forward:/help.html");
        registry.addRedirectViewController("/card_dashboard", "/card-dashboard.html");
        registry.addRedirectViewController("/card-dashboard", "/card-dashboard.html");
    }
}
