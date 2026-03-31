package com.sieglings.persistence.repo;

import com.sieglings.persistence.entity.MatchHistoryEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MatchHistoryRepository extends JpaRepository<MatchHistoryEntity, String> {
    List<MatchHistoryEntity> findTop12ByUser_IdOrderByFinishedAtDesc(Long userId);
}
