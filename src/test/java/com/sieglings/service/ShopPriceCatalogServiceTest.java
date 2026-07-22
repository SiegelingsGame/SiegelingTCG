package com.sieglings.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sieglings.model.enums.CardType;
import com.sieglings.model.enums.Rarity;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ShopPriceCatalogServiceTest {

    @Test
    void returnsDefaultPriceForEveryRarityWhenNoOverrideIsSet() {
        ShopPriceCatalogService service = inMemoryService();

        for (Rarity rarity : Rarity.values()) {
            assertEquals(
                    ShopPriceCatalogService.DEFAULT_PRICE_BY_RARITY.get(rarity),
                    service.priceFor(rarity, CardType.SIEGLING)
            );
            assertEquals(
                    ShopPriceCatalogService.DEFAULT_TRAINER_PRICE_BY_RARITY.get(rarity),
                    service.priceFor(rarity, CardType.TRAINER)
            );
            assertTrue(
                    service.priceFor(rarity, CardType.TRAINER) >= 300,
                    "SiegeKnight defaults must start at 300 Siegecoins"
            );
        }

        List<ShopPriceCatalogService.PriceRow> grid = service.buildPriceGrid();
        assertEquals(Rarity.values().length * CardType.values().length, grid.size());
        assertTrue(grid.stream().noneMatch(ShopPriceCatalogService.PriceRow::isOverride));
        assertEquals(
                ShopPriceCatalogService.DEFAULT_TRAINER_PRICE_BY_RARITY.get(Rarity.COMMON),
                grid.stream()
                        .filter(row -> row.rarity() == Rarity.COMMON && row.cardType() == CardType.TRAINER)
                        .findFirst()
                        .orElseThrow()
                        .defaultPrice()
        );
    }

    @Test
    void setOverrideWinsForItsExactRarityAndCardTypeOnlyThenResetRestoresDefault() {
        ShopPriceCatalogService service = inMemoryService();

        service.setPrice(Rarity.RARE, CardType.SPELL, 999, "editor@example.com");

        assertEquals(999, service.priceFor(Rarity.RARE, CardType.SPELL));
        // A different card type at the same rarity is unaffected.
        assertEquals(
                ShopPriceCatalogService.DEFAULT_PRICE_BY_RARITY.get(Rarity.RARE),
                service.priceFor(Rarity.RARE, CardType.TRAP)
        );

        ShopPriceCatalogService.PriceRow overriddenRow = service.buildPriceGrid().stream()
                .filter(row -> row.rarity() == Rarity.RARE && row.cardType() == CardType.SPELL)
                .findFirst()
                .orElseThrow();
        assertTrue(overriddenRow.isOverride());
        assertEquals(999, overriddenRow.overridePrice());
        assertEquals(999, overriddenRow.price());

        service.clearPrice(Rarity.RARE, CardType.SPELL, "editor@example.com");

        assertEquals(
                ShopPriceCatalogService.DEFAULT_PRICE_BY_RARITY.get(Rarity.RARE),
                service.priceFor(Rarity.RARE, CardType.SPELL)
        );
        ShopPriceCatalogService.PriceRow resetRow = service.buildPriceGrid().stream()
                .filter(row -> row.rarity() == Rarity.RARE && row.cardType() == CardType.SPELL)
                .findFirst()
                .orElseThrow();
        assertFalse(resetRow.isOverride());
        assertNull(resetRow.overridePrice());
    }

    @Test
    void rejectsInvalidPricesAndMissingKeys() {
        ShopPriceCatalogService service = inMemoryService();

        assertThrows(IllegalArgumentException.class,
                () -> service.setPrice(Rarity.COMMON, CardType.SIEGLING, -1, "editor@example.com"));
        assertThrows(IllegalArgumentException.class,
                () -> service.setPrice(Rarity.COMMON, CardType.SIEGLING, ShopPriceCatalogService.MAX_PRICE + 1, "editor@example.com"));
        assertThrows(IllegalArgumentException.class,
                () -> service.setPrice(null, CardType.SIEGLING, 100, "editor@example.com"));
        assertThrows(IllegalArgumentException.class,
                () -> service.setPrice(Rarity.COMMON, null, 100, "editor@example.com"));
        assertThrows(IllegalArgumentException.class,
                () -> service.priceFor(null, CardType.SIEGLING));

        // Boundary values are accepted.
        service.setPrice(Rarity.LEGENDARY, CardType.TRAINER, ShopPriceCatalogService.MIN_PRICE, "editor@example.com");
        assertEquals(ShopPriceCatalogService.MIN_PRICE, service.priceFor(Rarity.LEGENDARY, CardType.TRAINER));
        service.setPrice(Rarity.LEGENDARY, CardType.TRAINER, ShopPriceCatalogService.MAX_PRICE, "editor@example.com");
        assertEquals(ShopPriceCatalogService.MAX_PRICE, service.priceFor(Rarity.LEGENDARY, CardType.TRAINER));
    }

    /**
     * A ShopPriceCatalogService backed purely by an in-memory JsonNode instead of Firestore or
     * the project resource file, so the test never touches the filesystem or a network client.
     * The constructor still needs a CardOverrideStorageService, but it is never invoked because
     * loadSnapshot/saveSnapshot are overridden below.
     */
    private ShopPriceCatalogService inMemoryService() {
        ObjectMapper objectMapper = new ObjectMapper();
        CardOverrideStorageService storage = new CardOverrideStorageService(
                objectMapper, false, "", "", "(default)", "appConfig", "cardOverrides"
        );
        AtomicReference<JsonNode> holder = new AtomicReference<>(
                objectMapper.valueToTree(new ShopPriceCatalogService.ShopPriceFile(List.of()))
        );
        return new ShopPriceCatalogService(objectMapper, storage, "appConfig", "shopPrices") {
            @Override
            public LoadSnapshot loadSnapshot() {
                return new LoadSnapshot(holder.get(), CardOverrideStorageService.StorageBackend.CLASSPATH_RESOURCE, "in-memory", false, null, null);
            }

            @Override
            public LoadSnapshot saveSnapshot(JsonNode data, String updatedByEmail) {
                holder.set(data);
                return new LoadSnapshot(data, CardOverrideStorageService.StorageBackend.CLASSPATH_RESOURCE, "in-memory", false, updatedByEmail, null);
            }
        };
    }
}
