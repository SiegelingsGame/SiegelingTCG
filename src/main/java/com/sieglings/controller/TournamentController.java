package com.sieglings.controller;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.service.AccountService;
import com.sieglings.service.TournamentService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The Lobbies page's tournament feed: today's rotating tournament with its
 * standings, the days coming up, and (signed in) the player's own place and any
 * finished tournament prizes waiting to be claimed.
 */
@RestController
public class TournamentController {

    private static final int TOP_N = 10;
    private static final int UPCOMING = 3;
    private static final int CLAIM_LOOKBACK_DAYS = 7;

    @Autowired
    private TournamentService tournamentService;

    @Autowired
    private AccountService accountService;

    @GetMapping("/api/tournaments")
    public Map<String, Object> tournaments(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Instant now = Instant.now();
        AccountUser user = accountService.findUser(authorization);
        TournamentService.Tournament current = tournamentService.current(now);

        Map<String, Object> currentOut = tournamentService.describe(current);
        // Standings come from Firestore; when it is unreachable the page still
        // shows the tournament and its rule, with the board marked unavailable.
        List<TournamentService.Standing> standings;
        try {
            standings = tournamentService.standings(current.id(), now);
            currentOut.put("standingsAvailable", true);
        } catch (RuntimeException ex) {
            standings = List.of();
            currentOut.put("standingsAvailable", false);
        }
        List<Map<String, Object>> top = new ArrayList<>();
        for (int i = 0; i < Math.min(TOP_N, standings.size()); i++) {
            top.add(TournamentService.describe(standings.get(i), i + 1));
        }
        currentOut.put("standings", top);
        currentOut.put("entrants", standings.size());
        if (user != null) {
            int place = TournamentService.placeOf(standings, user.getId());
            currentOut.put("me", place == 0 ? null : TournamentService.describe(standings.get(place - 1), place));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("now", now.toString());
        out.put("current", currentOut);
        out.put("upcoming", tournamentService.upcoming(now, UPCOMING).stream().map(tournamentService::describe).toList());
        out.put("signedIn", user != null);
        if (user != null) {
            List<Map<String, Object>> claimable;
            try {
                claimable = tournamentService.claimable(user, now, CLAIM_LOOKBACK_DAYS);
            } catch (RuntimeException ex) {
                claimable = List.of();
            }
            out.put("claimable", claimable);
        }
        return out;
    }

    @PostMapping("/api/tournaments/claim")
    public Map<String, Object> claim(@RequestBody(required = false) Map<String, Object> req,
                                     @RequestHeader(value = "Authorization", required = false) String authorization) {
        try {
            AccountUser user = accountService.findUser(authorization);
            String tournamentId = req == null ? null : (String) req.get("tournamentId");
            int coins = tournamentService.claim(user, tournamentId, Instant.now());
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("tournamentId", tournamentId);
            out.put("awarded", coins);
            out.put("alreadyClaimed", coins == 0);
            return out;
        } catch (IllegalArgumentException | IllegalStateException ex) {
            return Map.of("error", ex.getMessage());
        }
    }
}
