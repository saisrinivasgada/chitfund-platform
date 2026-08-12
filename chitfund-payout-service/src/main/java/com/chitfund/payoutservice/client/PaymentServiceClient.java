package com.chitfund.payoutservice.client;

import com.chitfund.common.context.TenantContext;
import com.chitfund.payoutservice.domain.enums.DisbursementMode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class PaymentServiceClient {

    private final RestTemplate restTemplate;

    @Value("${app.payment-service-url:http://localhost:8084}")
    private String paymentServiceUrl;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    /**
     * Marks a specific month's payment record as PAYOUT_DEDUCTED — winner's installment withheld from payout.
     * Called during payout creation so the mark is atomic with the payout record.
     */
    public void markPayoutDeducted(UUID chitId, UUID memberId, int monthNumber, UUID payoutId) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Internal-Key", internalKey);
        headers.set("Content-Type", "application/json");

        Map<String, Object> body = Map.of(
                "chitId", chitId.toString(),
                "memberId", memberId.toString(),
                "monthNumber", monthNumber,
                "payoutId", payoutId.toString()
        );

        try {
            restTemplate.postForObject(
                    paymentServiceUrl + "/payments/internal/mark-payout-deducted",
                    new HttpEntity<>(body, headers),
                    Void.class
            );
            log.info("PAYOUT_DEDUCTED marked — chit {} member {} month {} payout {}", chitId, memberId, monthNumber, payoutId);
        } catch (Exception e) {
            log.error("Failed to mark PAYOUT_DEDUCTED for chit {} member {} month {} — {}", chitId, memberId, monthNumber, e.getMessage());
        }
    }

    /**
     * Clears cross-chit dues withheld from a payout using FIFO — oldest month first, no treasury movement.
     */
    public void markCrossChitDisbursementSettled(UUID chitId, UUID memberId, java.math.BigDecimal amount, UUID payoutId) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Internal-Key", internalKey);
        headers.set("Content-Type", "application/json");

        Map<String, Object> body = Map.of(
                "chitId", chitId.toString(),
                "memberId", memberId.toString(),
                "amount", amount,
                "payoutId", payoutId.toString()
        );

        try {
            restTemplate.postForObject(
                    paymentServiceUrl + "/payments/internal/mark-cross-chit-disbursement-settled",
                    new HttpEntity<>(body, headers),
                    Void.class
            );
            log.info("Cross-chit PAYOUT_DEDUCTED — chit {} member {} ₹{} payout {}", chitId, memberId, amount, payoutId);
        } catch (Exception e) {
            log.error("Failed to mark cross-chit PAYOUT_DEDUCTED for chit {} member {} — {}", chitId, memberId, e.getMessage());
        }
    }

    /**
     * Reverts all PAYOUT_DEDUCTED records linked to this payout back to OUTSTANDING.
     * Called during void so the winner's withheld installment shows as owed again.
     */
    public void revertPayoutDeductions(UUID payoutId) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Internal-Key", internalKey);

        try {
            restTemplate.postForObject(
                    paymentServiceUrl + "/payments/internal/revert-payout-deductions/" + payoutId,
                    new HttpEntity<>(headers),
                    Void.class
            );
            log.info("PAYOUT_DEDUCTED records reverted for payout {}", payoutId);
        } catch (Exception e) {
            log.error("Failed to revert PAYOUT_DEDUCTED for payout {} — records may be stale: {}", payoutId, e.getMessage());
        }
    }

    /**
     * Records a treasury IN entry when a voided payout had money already disbursed.
     * Keeps treasury balance correct — the disbursed OUT is offset by this reversal IN.
     */
    public void recordPayoutVoidReversal(BigDecimal amount, DisbursementMode mode, UUID payoutId) {
        String accountType = (mode == DisbursementMode.CASH) ? "CASH" : "BANK";
        String description = "Payout voided · reversal of ₹" + amount + " via " + mode + " · payout " + payoutId;

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Internal-Key", internalKey);
        headers.set("Content-Type", "application/json");

        Map<String, Object> body = Map.of(
                "amount", amount,
                "accountType", accountType,
                "description", description,
                "tenantId", TenantContext.get() != null ? TenantContext.get() : ""
        );

        try {
            restTemplate.postForObject(
                    paymentServiceUrl + "/admin/wallet/internal/payout-void-reversal",
                    new HttpEntity<>(body, headers),
                    Void.class
            );
            log.info("Treasury reversal recorded — ₹{} IN ({}) for voided payout {}", amount, accountType, payoutId);
        } catch (Exception e) {
            log.error("Failed to record treasury reversal for voided payout {} — treasury may be out of sync: {}", payoutId, e.getMessage());
        }
    }

    /**
     * Records a treasury OUT entry in the payment service when payout money leaves the admin's hands.
     * CASH disbursal → CASH account. UPI/BANK_TRANSFER/CHEQUE → BANK account.
     * Fire-and-forget: treasury mismatch is not worth failing the disbursement over.
     */
    public void recordPayoutDebit(BigDecimal amount, DisbursementMode mode, UUID payoutId, UUID memberId) {
        String accountType = (mode == DisbursementMode.CASH) ? "CASH" : "BANK";
        String description = "Payout disbursed · " + memberId + " via " + mode;

        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Internal-Key", internalKey);
        headers.set("Content-Type", "application/json");

        Map<String, Object> body = Map.of(
                "amount", amount,
                "accountType", accountType,
                "description", description,
                "tenantId", TenantContext.get() != null ? TenantContext.get() : ""
        );

        try {
            restTemplate.postForObject(
                    paymentServiceUrl + "/admin/wallet/internal/payout-debit",
                    new HttpEntity<>(body, headers),
                    Void.class
            );
            log.info("Treasury OUT recorded — ₹{} from {} for payout {}", amount, accountType, payoutId);
        } catch (Exception e) {
            log.error("Failed to record treasury debit for payout {} — treasury may be out of sync: {}", payoutId, e.getMessage());
        }
    }
}
