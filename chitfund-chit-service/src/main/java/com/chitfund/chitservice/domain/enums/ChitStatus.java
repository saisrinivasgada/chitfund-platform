package com.chitfund.chitservice.domain.enums;

import java.util.Map;
import java.util.Set;

/**
 * State machine for a Chit's lifecycle.
 *
 * DRAFT  → ACTIVE, CANCELLED, DELETED
 * ACTIVE → PAUSED, COMPLETED, CANCELLED, DELETED
 * PAUSED → ACTIVE (resume), CANCELLED, DELETED
 * COMPLETED → DELETED (audit trail only)
 * CANCELLED, DELETED → terminal states
 *
 * WHY PAUSED as a first-class status?
 * During Covid/shutdown, admin must freeze payment generation and payout processing
 * without losing the chit's history. PAUSED lets downstream services (payment-service,
 * notification-service) gate their logic on chit status — no special flags needed.
 *
 * WHY soft-delete (DELETED status) instead of physical delete?
 * Financial records must be auditable. Physically deleting a chit destroys payment
 * history, payout records, member balances. Soft-delete preserves all data; reports
 * filter by status != DELETED. This is standard practice in fintech.
 */
public enum ChitStatus {
    DRAFT,
    ACTIVE,
    PAUSED,
    COMPLETED,
    CANCELLED,
    DELETED;

    private static final Map<ChitStatus, Set<ChitStatus>> VALID_TRANSITIONS = Map.of(
            DRAFT,     Set.of(ACTIVE, CANCELLED, DELETED),
            ACTIVE,    Set.of(DRAFT, PAUSED, COMPLETED, CANCELLED, DELETED),
            PAUSED,    Set.of(ACTIVE, CANCELLED, DELETED),
            COMPLETED, Set.of(DELETED),
            CANCELLED, Set.of(),
            DELETED,   Set.of()
    );

    public boolean canTransitionTo(ChitStatus target) {
        return VALID_TRANSITIONS.getOrDefault(this, Set.of()).contains(target);
    }
}
