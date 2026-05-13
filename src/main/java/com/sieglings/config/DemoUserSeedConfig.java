package com.sieglings.config;

import com.sieglings.persistence.firestore.AccountUserStore;
import com.sieglings.service.AccountService;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Optional demo account at {@code accountUsers/demo@local.test} (BCrypt-hashed password).
 * Enable with {@code app.seed-demo-user=true}.
 */
@Configuration
@ConditionalOnProperty(name = "app.seed-demo-user", havingValue = "true")
public class DemoUserSeedConfig {

    @Bean
    ApplicationRunner seedDemoUser(AccountService accountService, AccountUserStore userStore) {
        return args -> {
            String email = "demo@local.test";
            try {
                if (userStore.findById(email).isPresent()) {
                    return;
                }
                accountService.register(email, "demo12345", "Demo Player");
            } catch (RuntimeException ignored) {
                // Firestore may not be reachable at boot; skip seeding.
            }
        };
    }
}
