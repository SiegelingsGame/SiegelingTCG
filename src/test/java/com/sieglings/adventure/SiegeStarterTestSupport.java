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

    static TrainerCard starterKnight(SiegeContentService content) {
        return content.selectableKnights().stream()
                .filter(k -> "squire-bob".equalsIgnoreCase(k.getId()))
                .findFirst()
                .orElseGet(() -> content.selectableKnights().getFirst());
    }

    /** A full starting warband led by {@code lead}, topped up from the catalog. */
    static List<String> starterIds(SiegeContentService content, TrainerCard knight, SieglingCard lead) {
        List<String> ids = new ArrayList<>();
        ids.add(lead.getId());
        for (SieglingCard s : content.selectableSieglings()) {
            if (ids.size() >= content.startingPartySize(knight)) break;
            if (!ids.contains(s.getId())) ids.add(s.getId());
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
                .filter(filter)
                .map(SieglingCard::getId)
                .distinct()
                .limit(content.startingPartySize(knight))
                .toList();
        return ids.size() == content.startingPartySize(knight) ? ids : List.of();
    }
}
