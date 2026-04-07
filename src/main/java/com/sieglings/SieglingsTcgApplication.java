package com.sieglings;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class SieglingsTcgApplication {
    public static void main(String[] args) {
        SpringApplication.run(SieglingsTcgApplication.class, args);
    }
}
