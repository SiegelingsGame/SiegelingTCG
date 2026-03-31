package com.sieglings.persistence.repo;

import com.sieglings.persistence.entity.AuthSession;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuthSessionRepository extends JpaRepository<AuthSession, String> {
}
