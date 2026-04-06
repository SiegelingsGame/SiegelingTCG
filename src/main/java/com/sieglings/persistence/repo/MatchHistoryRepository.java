package com.sieglings.persistence.repo;

import com.sieglings.persistence.entity.MatchHistoryEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface MatchHistoryRepository extends JpaRepository<MatchHistoryEntity, String> {
    List<MatchHistoryEntity> findTop12ByUser_IdOrderByFinishedAtDesc(Long userId);

    @Query(value = """
            SELECT u.display_name, COUNT(*)
            FROM match_history h
            INNER JOIN account_users u ON h.user_id = u.id
            WHERE h.result = 'WIN'
            GROUP BY u.id, u.display_name
            ORDER BY COUNT(*) DESC
            FETCH FIRST 10 ROWS ONLY
            """, nativeQuery = true)
    List<Object[]> leaderboardWins();

    @Query(value = """
            SELECT u.display_name, COUNT(*)
            FROM match_history h
            INNER JOIN account_users u ON h.user_id = u.id
            GROUP BY u.id, u.display_name
            ORDER BY COUNT(*) DESC
            FETCH FIRST 10 ROWS ONLY
            """, nativeQuery = true)
    List<Object[]> leaderboardMatchesPlayed();

    @Query(value = """
            SELECT u.display_name, COALESCE(SUM(h.spells_cast), 0)
            FROM match_history h
            INNER JOIN account_users u ON h.user_id = u.id
            GROUP BY u.id, u.display_name
            HAVING COALESCE(SUM(h.spells_cast), 0) > 0
            ORDER BY COALESCE(SUM(h.spells_cast), 0) DESC
            FETCH FIRST 10 ROWS ONLY
            """, nativeQuery = true)
    List<Object[]> leaderboardSpellsCast();

    @Query(value = """
            SELECT u.display_name, COALESCE(SUM(h.traps_sprung), 0)
            FROM match_history h
            INNER JOIN account_users u ON h.user_id = u.id
            GROUP BY u.id, u.display_name
            HAVING COALESCE(SUM(h.traps_sprung), 0) > 0
            ORDER BY COALESCE(SUM(h.traps_sprung), 0) DESC
            FETCH FIRST 10 ROWS ONLY
            """, nativeQuery = true)
    List<Object[]> leaderboardTrapsSprung();

    @Query(value = """
            SELECT u.display_name, COALESCE(SUM(h.siegelings_defeated), 0)
            FROM match_history h
            INNER JOIN account_users u ON h.user_id = u.id
            GROUP BY u.id, u.display_name
            HAVING COALESCE(SUM(h.siegelings_defeated), 0) > 0
            ORDER BY COALESCE(SUM(h.siegelings_defeated), 0) DESC
            FETCH FIRST 10 ROWS ONLY
            """, nativeQuery = true)
    List<Object[]> leaderboardSiegelingsDefeated();

    @Query(value = """
            SELECT u.display_name,
                   SUM(CASE WHEN h.result = 'WIN' THEN 1 ELSE 0 END),
                   SUM(CASE WHEN h.result = 'LOSS' THEN 1 ELSE 0 END)
            FROM match_history h
            INNER JOIN account_users u ON h.user_id = u.id
            WHERE h.match_type = 'ONLINE' AND h.result IN ('WIN', 'LOSS')
            GROUP BY u.id, u.display_name
            HAVING SUM(CASE WHEN h.result = 'WIN' THEN 1 ELSE 0 END) + SUM(CASE WHEN h.result = 'LOSS' THEN 1 ELSE 0 END) > 0
            ORDER BY
                (CAST(SUM(CASE WHEN h.result = 'WIN' THEN 1 ELSE 0 END) AS DOUBLE))
                    / NULLIF(SUM(CASE WHEN h.result = 'WIN' THEN 1 ELSE 0 END) + SUM(CASE WHEN h.result = 'LOSS' THEN 1 ELSE 0 END), 0)
                DESC,
                SUM(CASE WHEN h.result = 'WIN' THEN 1 ELSE 0 END) DESC
            FETCH FIRST 10 ROWS ONLY
            """, nativeQuery = true)
    List<Object[]> leaderboardPvpWinRate();
}
