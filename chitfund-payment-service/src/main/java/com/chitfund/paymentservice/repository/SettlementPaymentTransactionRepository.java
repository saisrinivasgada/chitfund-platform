package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.SettlementPaymentTransaction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Data access for SettlementPaymentTransaction.
 *
 * WHY existsByIdempotencyKey + findByIdempotencyKey as two separate methods?
 * The idempotency check path is a fast boolean query (no object hydration).
 * We only fetch the full entity when we actually need to return the response
 * (the "return existing row" path). This keeps the happy path (non-duplicate) lean.
 */
public interface SettlementPaymentTransactionRepository
        extends JpaRepository<SettlementPaymentTransaction, UUID> {

    /**
     * All transactions for a given settlement, ordered oldest-first.
     * Used to build the payment history timeline on the settlement detail screen.
     */
    List<SettlementPaymentTransaction> findBySettlement_IdOrderByCreatedAtAsc(UUID settlementId);

    /** Fast existence check used as the first step of idempotency handling. */
    boolean existsByIdempotencyKey(String idempotencyKey);

    /** Fetches the full transaction when we need to return it on a duplicate request. */
    Optional<SettlementPaymentTransaction> findByIdempotencyKey(String idempotencyKey);
}
