package com.sieglings.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.sieglings.service.CardOverrideEditorService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class CardEditorController {

    private final CardOverrideEditorService cardOverrideEditorService;

    public CardEditorController(CardOverrideEditorService cardOverrideEditorService) {
        this.cardOverrideEditorService = cardOverrideEditorService;
    }

    @GetMapping("/api/cards/editor")
    public Map<String, Object> getEditorState() {
        return cardOverrideEditorService.loadEditorState();
    }

    @PostMapping("/api/cards/editor")
    public Map<String, Object> saveEditorState(@RequestBody JsonNode data) {
        try {
            return cardOverrideEditorService.saveEditorState(data);
        } catch (RuntimeException ex) {
            return Map.of("error", ex.getMessage());
        }
    }
}
