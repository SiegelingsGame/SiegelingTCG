package com.sieglings.adventure;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;

/**
 * Server-authoritative logic and hidden state for the three cache/event puzzle
 * mini-games: LINE (Flow-Free style pipe connect), RPS (best-of-three ro-sham-bo),
 * and MATCH (memory pairs). Generation and validation live here as pure helpers so
 * the client never sees a solution and can never claim an unearned reward — the only
 * things exposed to the browser are the endpoints (LINE), a per-round tell (RPS) and
 * matched symbols (MATCH). {@link SiegeService} owns the orchestration + gold flow.
 */
final class SiegePuzzles {

    private SiegePuzzles() { }

    // ==== LINE (line-connect) ==============================================

    static final int LINE_SIZE = 5;
    /** Endpoints need at least one drawable grid cell between them. */
    static final int LINE_MIN_ENDPOINT_DISTANCE = 2;

    /**
     * A 5×5 line-connect board. Only the coloured endpoint pairs are ever sent to the
     * client; the carved solution paths that guarantee solvability stay server-side.
     */
    static final class LineBoard {
        final int size = LINE_SIZE;
        /** Endpoint pairs per colour index: {@code endpoints.get(color) == {r1,c1,r2,c2}}. */
        final List<int[]> endpoints = new ArrayList<>();
        int colors() { return endpoints.size(); }
    }

    /**
     * Builds a solvable board by carving non-overlapping self-avoiding paths on a fresh
     * grid (each occupies its own cells), then exposing only the two ends of each path.
     * Each accepted path has an interior tile and non-adjacent endpoints, so a colour
     * never spawns as a zero-length connection between neighboring runes.
     * Because the carved paths themselves form a valid non-crossing connection, at least
     * one solution always exists (coverage need not be full — spare cells are allowed).
     */
    static LineBoard generateLine(Random rng) {
        int colors = 3 + rng.nextInt(2); // 3 or 4 colours
        for (int attempt = 0; attempt < 240; attempt++) {
            int[][] owner = new int[LINE_SIZE][LINE_SIZE];
            for (int[] row : owner) java.util.Arrays.fill(row, -1);
            LineBoard board = new LineBoard();
            boolean ok = true;
            for (int c = 0; c < colors; c++) {
                List<int[]> path = carveLinePath(owner, c, rng);
                if (path.size() < 3) { ok = false; break; }
                int[] a = path.get(0);
                int[] b = path.get(path.size() - 1);
                if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < LINE_MIN_ENDPOINT_DISTANCE) {
                    ok = false;
                    break;
                }
                board.endpoints.add(new int[]{a[0], a[1], b[0], b[1]});
            }
            if (ok && board.colors() == colors) return board;
        }
        // Fallback (statistically never reached): three separated straight pairs.
        LineBoard board = new LineBoard();
        board.endpoints.add(new int[]{0, 0, 0, 2});
        board.endpoints.add(new int[]{4, 2, 4, 4});
        board.endpoints.add(new int[]{2, 0, 2, 2});
        return board;
    }

    /** Random self-avoiding walk claiming free cells for {@code color}; returns its cells. */
    private static List<int[]> carveLinePath(int[][] owner, int color, Random rng) {
        List<int[]> free = new ArrayList<>();
        for (int r = 0; r < LINE_SIZE; r++)
            for (int c = 0; c < LINE_SIZE; c++)
                if (owner[r][c] == -1) free.add(new int[]{r, c});
        List<int[]> path = new ArrayList<>();
        if (free.isEmpty()) return path;
        int[] cur = free.get(rng.nextInt(free.size()));
        owner[cur[0]][cur[1]] = color;
        path.add(cur);
        int target = 2 + rng.nextInt(5); // 2..6 steps -> 3..7 cells
        int[][] dirs = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
        for (int step = 0; step < target; step++) {
            List<int[]> order = new ArrayList<>(List.of(dirs));
            Collections.shuffle(order, rng);
            int[] next = null;
            for (int[] d : order) {
                int nr = cur[0] + d[0];
                int nc = cur[1] + d[1];
                if (nr >= 0 && nr < LINE_SIZE && nc >= 0 && nc < LINE_SIZE && owner[nr][nc] == -1) {
                    next = new int[]{nr, nc};
                    break;
                }
            }
            if (next == null) break;
            owner[next[0]][next[1]] = color;
            path.add(next);
            cur = next;
        }
        return path;
    }

    /**
     * Validates submitted paths against a board. {@code paths.get(color)} is the ordered
     * list of {@code {r,c}} cells the player drew for that colour. A submission solves the
     * board when every colour connects its two endpoints via orthogonal single steps with
     * no cell used twice (within a path or across colours). Returns {@code true} only on a
     * complete, legal solve.
     */
    static boolean validateLine(LineBoard board, List<List<int[]>> paths) {
        if (paths == null || paths.size() != board.colors()) return false;
        boolean[][] used = new boolean[LINE_SIZE][LINE_SIZE];
        for (int color = 0; color < board.colors(); color++) {
            List<int[]> path = paths.get(color);
            if (path == null || path.size() < 2) return false;
            int[] ep = board.endpoints.get(color);
            int[] first = path.get(0);
            int[] last = path.get(path.size() - 1);
            boolean endsMatch =
                    (sameCell(first, ep[0], ep[1]) && sameCell(last, ep[2], ep[3])) ||
                    (sameCell(first, ep[2], ep[3]) && sameCell(last, ep[0], ep[1]));
            if (!endsMatch) return false;
            int[] prev = null;
            for (int[] cell : path) {
                if (cell == null || cell.length != 2) return false;
                int r = cell[0], c = cell[1];
                if (r < 0 || r >= LINE_SIZE || c < 0 || c >= LINE_SIZE) return false;
                if (used[r][c]) return false; // no cell reused (this path or another colour)
                if (prev != null && Math.abs(prev[0] - r) + Math.abs(prev[1] - c) != 1) return false;
                used[r][c] = true;
                prev = cell;
            }
        }
        return true;
    }

    private static boolean sameCell(int[] cell, int r, int c) {
        return cell != null && cell.length == 2 && cell[0] == r && cell[1] == c;
    }

    // ==== RPS (ro-sham-bo, best of three) ==================================

    static final String[] RPS_THROWS = {"ROCK", "PAPER", "SCISSORS"};
    /** Chance the pre-round "tell" hint names the NPC's actual throw. */
    static final int RPS_TELL_TRUTH_PCT = 70;

    /** A committed best-of-three match: the NPC's throws and per-round tells are fixed up front. */
    static final class RpsMatch {
        final List<String> npcThrows = new ArrayList<>();
        final List<String> tells = new ArrayList<>(); // hinted throw per round (70% truthful)
        final List<String> log = new ArrayList<>();    // human-readable round results
        int round;       // index of the round awaiting the player's throw
        int playerWins;
        int npcWins;
        boolean over;
        boolean playerWon;
    }

    static RpsMatch generateRps(Random rng) {
        RpsMatch m = new RpsMatch();
        for (int i = 0; i < 3; i++) {
            String actual = RPS_THROWS[rng.nextInt(3)];
            m.npcThrows.add(actual);
            String tell;
            if (rng.nextInt(100) < RPS_TELL_TRUTH_PCT) {
                tell = actual;
            } else {
                String other;
                do { other = RPS_THROWS[rng.nextInt(3)]; } while (other.equals(actual));
                tell = other;
            }
            m.tells.add(tell);
        }
        return m;
    }

    /** +1 player beats NPC, 0 tie, −1 player loses. */
    static int rpsOutcome(String player, String npc) {
        if (player.equals(npc)) return 0;
        boolean win = (player.equals("ROCK") && npc.equals("SCISSORS"))
                || (player.equals("PAPER") && npc.equals("ROCK"))
                || (player.equals("SCISSORS") && npc.equals("PAPER"));
        return win ? 1 : -1;
    }

    static boolean isRpsThrow(String s) {
        return "ROCK".equals(s) || "PAPER".equals(s) || "SCISSORS".equals(s);
    }

    // ==== MATCH (memory pairs) =============================================

    static final int MATCH_PAIRS = 8;      // 4×4 board
    static final int MATCH_MAX_MISSES = 5;
    private static final String[] MATCH_POOL = {
            "🦊", "🐉", "🦉", "🐢", "🦂", "🦅", "🐺", "🦎", "🐗", "🦇", "🐍", "🦡"
    };

    /** A shuffled 4×4 memory board; symbols stay server-side until matched or flipped. */
    static final class MatchBoard {
        final List<String> symbols = new ArrayList<>(); // 16 cells
        final boolean[] matched = new boolean[MATCH_PAIRS * 2];
        int misses;
        int pairsFound;
        int pendingFlip = -1; // first face-up tile, awaiting the player's second tap
        int[] lastFlip;        // {a, b} indices of the most recent flip, or null
        boolean lastFlipMatched;
    }

    static MatchBoard generateMatch(Random rng) {
        List<String> pool = new ArrayList<>(List.of(MATCH_POOL));
        Collections.shuffle(pool, rng);
        List<String> chosen = pool.subList(0, MATCH_PAIRS);
        MatchBoard b = new MatchBoard();
        for (String s : chosen) { b.symbols.add(s); b.symbols.add(s); }
        Collections.shuffle(b.symbols, rng);
        return b;
    }
}
