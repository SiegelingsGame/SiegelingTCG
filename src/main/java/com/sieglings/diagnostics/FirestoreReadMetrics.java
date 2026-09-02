package com.sieglings.diagnostics;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Counts Firestore document reads and the wall time spent inside them.
 *
 * Catalog reads are cached behind several independent TTLs, so the only way to
 * tell a cache hit from a round trip in production is to count the round trips
 * themselves. Recording is a counter bump on a path that has already paid for a
 * network call, and every read site records after the call returns, so this
 * changes no control flow and swallows nothing.
 */
public final class FirestoreReadMetrics {

    private static final ConcurrentHashMap<String, Counter> COUNTERS = new ConcurrentHashMap<>();

    private FirestoreReadMetrics() {
    }

    private static final class Counter {
        private final AtomicLong reads = new AtomicLong();
        private final AtomicLong nanos = new AtomicLong();
    }

    public static void record(String label, long elapsedNanos) {
        Counter counter = COUNTERS.computeIfAbsent(label, key -> new Counter());
        counter.reads.incrementAndGet();
        counter.nanos.addAndGet(elapsedNanos);
    }

    /** Immutable point-in-time copy: {label: {reads, millis}}. */
    public static Map<String, Map<String, Long>> snapshot() {
        Map<String, Map<String, Long>> out = new LinkedHashMap<>();
        COUNTERS.forEach((label, counter) -> {
            Map<String, Long> row = new LinkedHashMap<>();
            row.put("reads", counter.reads.get());
            row.put("millis", counter.nanos.get() / 1_000_000L);
            out.put(label, row);
        });
        return out;
    }

    /** Per-label difference of two snapshots, keeping only labels that moved. */
    public static Map<String, Map<String, Long>> delta(
            Map<String, Map<String, Long>> before,
            Map<String, Map<String, Long>> after
    ) {
        Map<String, Map<String, Long>> out = new LinkedHashMap<>();
        after.forEach((label, afterRow) -> {
            Map<String, Long> beforeRow = before.getOrDefault(label, Map.of());
            long reads = afterRow.getOrDefault("reads", 0L) - beforeRow.getOrDefault("reads", 0L);
            long millis = afterRow.getOrDefault("millis", 0L) - beforeRow.getOrDefault("millis", 0L);
            if (reads > 0 || millis > 0) {
                Map<String, Long> row = new LinkedHashMap<>();
                row.put("reads", reads);
                row.put("millis", millis);
                out.put(label, row);
            }
        });
        return out;
    }
}
