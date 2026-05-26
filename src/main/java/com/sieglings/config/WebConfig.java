package com.sieglings.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

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
                .maxAge(3600);
    }

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addViewController("/").setViewName("forward:/landing.html");
        registry.addViewController("/home").setViewName("forward:/home.html");
        registry.addViewController("/cards").setViewName("forward:/home.html");
        registry.addViewController("/decks").setViewName("forward:/home.html");
        registry.addViewController("/lobbies").setViewName("forward:/home.html");
        registry.addViewController("/social").setViewName("forward:/home.html");
        registry.addViewController("/profile").setViewName("forward:/home.html");
        registry.addViewController("/shop").setViewName("forward:/home.html");
        registry.addViewController("/login").setViewName("forward:/home.html");
        registry.addViewController("/play").setViewName("forward:/play.html");
        registry.addRedirectViewController("/card_dashboard", "/card-dashboard.html");
        registry.addRedirectViewController("/card-dashboard", "/card-dashboard.html");
    }
}
