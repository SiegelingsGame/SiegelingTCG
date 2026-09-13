package com.sieglings.adventure;

import com.sieglings.model.SieglingCard;
import com.sieglings.model.TrainerCard;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;

/**
 * Warband assembly for Siege tests. Only expedition-starter knights are
 * selectable for a signed-out run, and the default starter (Squire Bob) is a
 * MARSHAL — so a legal STANDARD run needs as many starters as its muster,
 * not a hard-coded one.
 */
final class SiegeStarterTestSupport {

    private SiegeStarterTestSupport() {
    }

    /**
     * Catalog Siegelings a signed-out run may actually take. Water/Electric are
     * sold for Siegecoins (and need the card owned), so they are never legal
     * warband picks in tests that start a run as a guest.
     */
    static List<SieglingCard> freeSelectable(SiegeContentService content) {
        return content.selectableSieglings().stream()
                .filter(s -> !content.isSiegePurchaseSiegling(s))
                .toList();
    }

    static TrainerCard starterKnight(SiegeContentService content) {
        return content.selectableKnights().stream()
                .filter(k -> "squire-bob".equalsIgnoreCase(k.getId()))
                .findFirst()
                .orElseGet(() -> content.selectableKnights().getFirst());
    }

    /**
     * A full starting warband led by {@code lead}, topped up from the catalog.
     * Purchase-element Siegelings (Water/Electric) are skipped when filling: a
     * signed-out run cannot take them, so they would fail the run at Start.
     */
    static List<String> starterIds(SiegeContentService content, TrainerCard knight, SieglingCard lead) {
        List<String> ids = new ArrayList<>();
        ids.add(lead.getId());
        for (SieglingCard s : content.selectableSieglings()) {
            if (ids.size() >= content.startingPartySize(knight)) break;
            if (!ids.contains(s.getId()) && !content.isSiegePurchaseSiegling(s)) ids.add(s.getId());
        }
        return ids;
    }

    /**
     * A full starting warband where every member satisfies {@code filter} —
     * empty when the catalog cannot supply enough of them, so callers can skip.
     */
    static List<String> starterIdsMatching(SiegeContentService content, TrainerCard knight,
                                           Predicate<SieglingCard> filter) {
        List<String> ids = content.selectableSieglings().stream()
                .filter(s -> !content.isSiegePurchaseSiegling(s))
                .filter(filter)
                .map(SieglingCard::getId)
                .distinct()
                .limit(content.startingPartySize(knight))
                .toList();
        return ids.size() == content.startingPartySize(knight) ? ids : List.of();
    }
}
