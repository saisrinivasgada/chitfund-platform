package com.chitfund.supportservice.service;

import lombok.AccessLevel;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Runs best-effort realtime notifications only after the surrounding database
 * transaction commits. The database remains authoritative when a socket client
 * is disconnected or the broker is temporarily unavailable.
 */
@Slf4j
@NoArgsConstructor(access = AccessLevel.PRIVATE)
final class PostCommitAction {

    static void run(String description, Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            runSafely(description, action);
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                runSafely(description, action);
            }
        });
    }

    private static void runSafely(String description, Runnable action) {
        try {
            action.run();
        } catch (RuntimeException exception) {
            log.warn("{} failed after commit: {}", description, exception.getMessage());
        }
    }
}
