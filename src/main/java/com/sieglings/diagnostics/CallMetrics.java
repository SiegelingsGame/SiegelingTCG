package com.sieglings.diagnostics;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Counts invocations of the catalog paths that sit between Firestore reads.
 *
 * Read counts alone did not explain /api/game/options: Firestore accounted for
 * 1.5s of a 22s build, so the time is going somewhere in-process. How often
 * these paths run is fixed by the call graph, not by whether Firestore is
 * reachable, so the multiplier is measurable without touching production.
 */
public final class CallMetrics {

    private static final ConcurrentHashMap<String, Counter> COUNTERS = new ConcurrentHashMap<>();

    private CallMetrics() {
    }

    private static final class Counter {
        private final AtomicLong calls = new AtomicLong();
        private final AtomicLong nanos = new AtomicLong();
    }

    public static void record(String label, long elapsedNanos) {
        Counter counter = COUNTERS.computeIfAbsent(label, key -> new Counter());
        counter.calls.incrementAndGet();
        counter.nanos.addAndGet(elapsedNanos);
    }

    public static Map<String, Map<String, Long>> snapshot() {
        Map<String, Map<String, Long>> out = new LinkedHashMap<>();
        COUNTERS.forEach((label, counter) -> {
            Map<String, Long> row = new LinkedHashMap<>();
            row.put("calls", counter.calls.get());
            row.put("millis", counter.nanos.get() / 1_000_000L);
            out.put(label, row);
        });
        return out;
    }

    public static Map<String, Map<String, Long>> delta(
            Map<String, Map<String, Long>> before,
            Map<String, Map<String, Long>> after
    ) {
        Map<String, Map<String, Long>> out = new LinkedHashMap<>();
        after.forEach((label, afterRow) -> {
            Map<String, Long> beforeRow = before.getOrDefault(label, Map.of());
            long calls = afterRow.getOrDefault("calls", 0L) - beforeRow.getOrDefault("calls", 0L);
            long millis = afterRow.getOrDefault("millis", 0L) - beforeRow.getOrDefault("millis", 0L);
            if (calls > 0 || millis > 0) {
                Map<String, Long> row = new LinkedHashMap<>();
                row.put("calls", calls);
                row.put("millis", millis);
                out.put(label, row);
            }
        });
        return out;
    }
}
