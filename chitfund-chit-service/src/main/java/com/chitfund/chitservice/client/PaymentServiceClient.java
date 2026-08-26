package com.chitfund.chitservice.client;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class PaymentServiceClient {

    private final RestTemplate restTemplate;

    @Value("${app.payment-service-url:http://localhost:8083}")
    private String paymentServiceUrl;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    /**
     * Called after an auction closes. Creates payment records for all members
     * with gross installment, dividend deduction, and net amount due.
     */
    public void applyAuctionDividend(UUID chitId, Integer monthNumber,
                                     BigDecimal grossInstallmentAmount,
                                     BigDecimal dividendPerSpot,
                                     List<MemberSpot> memberSpots,
                                     String tenantId) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Internal-Key", internalKey);
            headers.set("X-Tenant-ID", tenantId);

            Map<String, Object> body = Map.of(
                    "chitId", chitId.toString(),
                    "monthNumber", monthNumber,
                    "grossInstallmentAmount", grossInstallmentAmount,
                    "dividendPerSpot", dividendPerSpot,
                    "memberSpots", memberSpots
            );

            restTemplate.exchange(
                    paymentServiceUrl + "/admin/draws/internal/apply-auction-dividend",
                    HttpMethod.POST,
                    new HttpEntity<>(body, headers),
                    Void.class);

            log.info("Auction dividend applied for chit {} month {}", chitId, monthNumber);
        } catch (RestClientException e) {
            log.error("Failed to apply auction dividend for chit {} month {}: {}", chitId, monthNumber, e.getMessage());
            throw new RuntimeException("Failed to create payment records after auction close", e);
        }
    }

    /**
     * Called when an admin voids or re-opens a closed auction.
     * Resets the draw back to AWAITING_AUCTION and deletes outstanding payment records.
     * Fails if any member has already paid (admin must void those batches first).
     */
    public void reverseAuctionDividend(UUID chitId, Integer monthNumber, String tenantId) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-Internal-Key", internalKey);
            headers.set("X-Tenant-ID", tenantId);

            Map<String, Object> body = Map.of(
                    "chitId", chitId.toString(),
                    "monthNumber", monthNumber
            );

            restTemplate.exchange(
                    paymentServiceUrl + "/admin/draws/internal/reverse-auction-dividend",
                    HttpMethod.POST,
                    new HttpEntity<>(body, headers),
                    Void.class);

            log.info("Auction dividend reversed for chit {} month {}", chitId, monthNumber);
        } catch (RestClientException e) {
            log.error("Failed to reverse auction dividend for chit {} month {}: {}", chitId, monthNumber, e.getMessage());
            throw new RuntimeException("Failed to reverse payment records: " + e.getMessage(), e);
        }
    }

    public record MemberSpot(UUID memberId, int spots) {}
}
