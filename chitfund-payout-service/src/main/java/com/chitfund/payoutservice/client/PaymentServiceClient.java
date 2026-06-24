package com.chitfund.payoutservice.client;

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
                "description", description
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
