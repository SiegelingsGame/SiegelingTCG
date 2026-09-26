package com.sieglings.controller;

import com.sieglings.persistence.entity.AccountUser;
import com.sieglings.service.AccountService;
import com.sieglings.service.MatchReviewService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class MatchReviewController {

    @Autowired
    private AccountService accountService;

    @Autowired
    private MatchReviewService matchReviewService;

    /** One recorded battle (with its replay when saved) or one finished Siege run. */
    @GetMapping("/api/match-history/{id}/review")
    public Map<String, Object> review(@RequestHeader(value = "Authorization", required = false) String authorizationHeader,
                                      @PathVariable("id") String id) {
        try {
            AccountUser viewer = accountService.findUser(authorizationHeader);
            return matchReviewService.review(viewer, id);
        } catch (IllegalArgumentException ex) {
            return Map.of("error", ex.getMessage());
        } catch (IllegalStateException ex) {
            return Map.of("error", "Match review is unavailable right now.");
        }
    }
}
