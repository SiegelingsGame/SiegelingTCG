package com.sieglings.adventure;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Pure-logic guards for the server-authoritative cache/event puzzle mini-games. */
class SiegePuzzlesTest {

    // ---- LINE ------------------------------------------------------------

    @Test
    void generatedLineBoardsAreAlwaysSolvable() {
        Random rng = new Random(12345);
        for (int i = 0; i < 60; i++) {
            SiegePuzzles.LineBoard board = SiegePuzzles.generateLine(rng);
            int colors = board.colors();
            assertTrue(colors >= 3 && colors <= 4, "expected 3–4 colours, got " + colors);
            for (int[] ep : board.endpoints) {
                assertTrue(inBounds(ep[0], ep[1]) && inBounds(ep[2], ep[3]), "endpoint out of bounds");
                assertFalse(ep[0] == ep[2] && ep[1] == ep[3], "endpoints must be distinct cells");
            }
            assertTrue(solvable(board), "generateLine must always yield a solvable board (seed run " + i + ")");
        }
    }

    @Test
    void validateLineAcceptsCorrectSolutionAndRejectsCheats() {
        SiegePuzzles.LineBoard board = new SiegePuzzles.LineBoard();
        board.endpoints.add(new int[]{0, 0, 0, 2}); // colour 0 across the top
        board.endpoints.add(new int[]{2, 0, 2, 2}); // colour 1 across the third row

        List<List<int[]>> good = new ArrayList<>();
        good.add(List.of(new int[]{0, 0}, new int[]{0, 1}, new int[]{0, 2}));
        good.add(List.of(new int[]{2, 0}, new int[]{2, 1}, new int[]{2, 2}));
        assertTrue(SiegePuzzles.validateLine(board, good), "a legal solution should validate");

        // Reusing a cell across two colours must fail.
        List<List<int[]>> reuse = new ArrayList<>();
        reuse.add(List.of(new int[]{0, 0}, new int[]{1, 0}, new int[]{1, 1}, new int[]{1, 2}, new int[]{0, 2}));
        reuse.add(List.of(new int[]{2, 0}, new int[]{1, 0}, new int[]{2, 2})); // (1,0) reused + a jump
        assertFalse(SiegePuzzles.validateLine(board, reuse), "reusing a cell must be rejected");

        // A non-adjacent jump must fail.
        List<List<int[]>> jump = new ArrayList<>();
        jump.add(List.of(new int[]{0, 0}, new int[]{0, 2}));               // skips (0,1)
        jump.add(List.of(new int[]{2, 0}, new int[]{2, 1}, new int[]{2, 2}));
        assertFalse(SiegePuzzles.validateLine(board, jump), "non-orthogonal steps must be rejected");

        // Wrong endpoints must fail.
        List<List<int[]>> wrongEnds = new ArrayList<>();
        wrongEnds.add(List.of(new int[]{0, 0}, new int[]{0, 1}));           // ends at (0,1), not (0,2)
        wrongEnds.add(List.of(new int[]{2, 0}, new int[]{2, 1}, new int[]{2, 2}));
        assertFalse(SiegePuzzles.validateLine(board, wrongEnds), "paths must join the actual endpoints");

        // Missing a colour must fail.
        List<List<int[]>> missing = new ArrayList<>();
        missing.add(List.of(new int[]{0, 0}, new int[]{0, 1}, new int[]{0, 2}));
        assertFalse(SiegePuzzles.validateLine(board, missing), "every colour must be connected");
    }

    // ---- RPS -------------------------------------------------------------

    @Test
    void rpsOutcomeFollowsRoShamBo() {
        assertEquals(1, SiegePuzzles.rpsOutcome("ROCK", "SCISSORS"));
        assertEquals(1, SiegePuzzles.rpsOutcome("PAPER", "ROCK"));
        assertEquals(1, SiegePuzzles.rpsOutcome("SCISSORS", "PAPER"));
        assertEquals(-1, SiegePuzzles.rpsOutcome("SCISSORS", "ROCK"));
        assertEquals(0, SiegePuzzles.rpsOutcome("ROCK", "ROCK"));
    }

    @Test
    void generatedRpsMatchCommitsThreeThrowsAndTells() {
        SiegePuzzles.RpsMatch match = SiegePuzzles.generateRps(new Random(7));
        assertEquals(3, match.npcThrows.size());
        assertEquals(3, match.tells.size());
        for (String t : match.npcThrows) assertTrue(SiegePuzzles.isRpsThrow(t));
        for (String t : match.tells) assertTrue(SiegePuzzles.isRpsThrow(t));
    }

    // ---- MATCH -----------------------------------------------------------

    @Test
    void generatedMatchBoardHasEightHiddenPairs() {
        SiegePuzzles.MatchBoard board = SiegePuzzles.generateMatch(new Random(99));
        assertEquals(SiegePuzzles.MATCH_PAIRS * 2, board.symbols.size());
        var counts = new java.util.HashMap<String, Integer>();
        for (String s : board.symbols) counts.merge(s, 1, Integer::sum);
        assertEquals(SiegePuzzles.MATCH_PAIRS, counts.size(), "should be 8 distinct symbols");
        for (int c : counts.values()) assertEquals(2, c, "each symbol appears exactly twice");
    }

    // ---- helpers ---------------------------------------------------------

    private static boolean inBounds(int r, int c) {
        return r >= 0 && r < SiegePuzzles.LINE_SIZE && c >= 0 && c < SiegePuzzles.LINE_SIZE;
    }

    /** Exhaustive backtracking flow solver used only to prove generated boards have a solution. */
    private static boolean solvable(SiegePuzzles.LineBoard board) {
        int n = SiegePuzzles.LINE_SIZE;
        int[][] used = new int[n][n];
        for (int[] row : used) java.util.Arrays.fill(row, -1);
        return place(board, 0, used);
    }

    private static boolean place(SiegePuzzles.LineBoard board, int color, int[][] used) {
        if (color == board.colors()) return true;
        int[] ep = board.endpoints.get(color);
        return dfs(board, color, ep[0], ep[1], ep[2], ep[3], used);
    }

    private static boolean dfs(SiegePuzzles.LineBoard board, int color, int r, int c, int tr, int tc, int[][] used) {
        if (used[r][c] != -1) return false;
        used[r][c] = color;
        if (r == tr && c == tc) {
            if (place(board, color + 1, used)) return true;
            used[r][c] = -1;
            return false;
        }
        int[][] dirs = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
        for (int[] d : dirs) {
            int nr = r + d[0], nc = c + d[1];
            if (inBounds(nr, nc) && used[nr][nc] == -1 && dfs(board, color, nr, nc, tr, tc, used)) return true;
        }
        used[r][c] = -1;
        return false;
    }
}
