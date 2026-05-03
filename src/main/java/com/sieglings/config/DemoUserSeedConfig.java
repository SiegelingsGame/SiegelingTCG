package com.sieglings.config;

import com.sieglings.persistence.repo.AccountUserRepository;
import com.sieglings.service.AccountService;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Optional local/demo row in {@code account_users} (password stored as BCrypt hash).
 * Enable with {@code app.seed-demo-user=true}.
 */
@Configuration
@ConditionalOnProperty(name = "app.seed-demo-user", havingValue = "true")
public class DemoUserSeedConfig {

    @Bean
    ApplicationRunner seedDemoUser(AccountService accountService, AccountUserRepository userRepository) {
        return args -> {
            String email = "demo@local.test";
            if (userRepository.findByEmail(email).isPresent()) {
                return;
            }
            accountService.register(email, "demo12345", "Demo Player");
        };
    }
}
