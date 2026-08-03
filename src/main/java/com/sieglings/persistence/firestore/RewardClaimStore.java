package com.sieglings.persistence.firestore;

import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.sieglings.persistence.entity.DailyMissionProgressEntity;
import com.sieglings.persistence.entity.PlayerProgressionEntity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

/**
 * Runs a reward claim as a single Firestore transaction over the player's
 * mission-progress and progression documents.
 *
 * <p>A claim is a read-modify-write spanning two documents: the already-claimed
 * marker lives in mission progress, the payout lands in the wallet. Read and
 * write as separate operations, two concurrent claims both observe a pre-claim
 * snapshot and both pay, leaving the ledger recording one claim and the wallet
 * holding two payouts. An in-process lock only closes that window for callers
 * sharing a JVM; Firestore's transactions close it for every caller, which is
 * what keeps the guarantee if this service is ever scaled past one instance.
 *
 * <p>Firestore transactions are optimistic: the body may run several times if
 * another writer touches either document first. It must therefore be a pure
 * function of the two entities handed to it — it is given freshly decoded
 * entities on every attempt and must not accumulate into captured state.
 * All reads happen before any write, as the API requires.
 */
@Component
public class RewardClaimStore {

    private static final long OP_TIMEOUT_SECONDS = 20;

    @Autowired
    private FirestoreUserDataClient client;

    @Autowired
    private DailyMissionProgressStore missionProgressStore;

    @Autowired
    private PlayerProgressionStore progressionStore;

    /** Mutates both entities and returns the caller's result. May be retried. */
    @FunctionalInterface
    public interface ClaimBody<T> {
        T apply(DailyMissionProgressEntity progress, PlayerProgressionEntity progression);
    }

    /** Supplies the starting wallet for a player who has no progression document yet. */
    @FunctionalInterface
    public interface ProgressionFactory {
        PlayerProgressionEntity create(String userId);
    }

    public boolean isAvailable() {
        return client != null && client.isAvailable();
    }

    /**
     * Applies {@code body} to the player's two documents inside one transaction,
     * committing both writes together. An {@link IllegalArgumentException} thrown
     * by the body (an already-claimed or not-yet-unlocked reward) aborts the
     * transaction without writing and is rethrown unchanged.
     */
    public <T> T runClaim(String userId, ProgressionFactory progressionFactory, ClaimBody<T> body) {
        if (userId == null || userId.isBlank()) {
            throw new IllegalArgumentException("A user id is required to claim a reward.");
        }
        DocumentReference missionDoc = missionProgressStore.doc(userId);
        DocumentReference progressionDoc = progressionStore.doc(userId);
        try {
            return client.requireFirestore().runTransaction(transaction -> {
                // Every read first — the transaction API rejects a read that
                // follows a write in the same transaction.
                DocumentSnapshot missionSnapshot = transaction.get(missionDoc).get();
                DocumentSnapshot progressionSnapshot = transaction.get(progressionDoc).get();

                DailyMissionProgressEntity progress = missionSnapshot.exists()
                        ? missionProgressStore.toEntity(userId, missionSnapshot)
                        : newProgress(userId);
                PlayerProgressionEntity progression = progressionSnapshot.exists()
                        ? progressionStore.toProgression(userId, progressionSnapshot)
                        : progressionFactory.create(userId);

                T result = body.apply(progress, progression);

                transaction.set(missionDoc, missionProgressStore.toPayload(progress));
                transaction.set(progressionDoc, progressionStore.toPayload(progression));
                return result;
            }).get(OP_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (ExecutionException ex) {
            // The body's rejection reason is the useful message; the transaction
            // wrapper around it is not.
            Throwable cause = ex.getCause();
            if (cause instanceof IllegalArgumentException illegalArgument) {
                throw illegalArgument;
            }
            if (cause instanceof RuntimeException runtime) {
                throw runtime;
            }
            throw new IllegalStateException("Unable to claim reward in Firestore.", ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while claiming reward.", ex);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to claim reward in Firestore.", ex);
        }
    }

    private DailyMissionProgressEntity newProgress(String userId) {
        DailyMissionProgressEntity progress = new DailyMissionProgressEntity();
        progress.setUserId(userId);
        return progress;
    }
}
