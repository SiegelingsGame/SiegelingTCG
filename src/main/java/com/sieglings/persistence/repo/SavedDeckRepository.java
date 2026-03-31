package com.sieglings.persistence.repo;

import com.sieglings.persistence.entity.SavedDeckEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SavedDeckRepository extends JpaRepository<SavedDeckEntity, String> {
    List<SavedDeckEntity> findByUser_IdOrderByUpdatedAtDesc(Long userId);
    Optional<SavedDeckEntity> findByIdAndUser_Id(String id, Long userId);
}
