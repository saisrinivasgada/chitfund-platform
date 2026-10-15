package com.chitfund.payoutservice.client;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.UUID;
import java.math.BigDecimal;
import java.util.Map;

@Component
@RequiredArgsConstructor
@Slf4j
public class ChitServiceClient {

    private final RestTemplate restTemplate;

    @Value("${app.chit-service-url:http://localhost:8082}")
    private String chitServiceUrl;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    @Data
    public static class WinnerDto {
        private int winnerCount;
        private UUID id;
        private UUID chitId;
        private UUID memberId;
        private int monthNumber;
        private BigDecimal winningAmount;
        private BigDecimal auctionDiscountAmount;
    }

    /**
     * Strictly verifies the recorded tenant-scoped winner before payout-service creates
     * a financial liability. Dependency failure is not treated as "no winner".
     */
    @SuppressWarnings("unchecked")
    public WinnerDto getWinnerForPayout(UUID chitId, int monthNumber, UUID memberId, String tenantId) {
        if (tenantId == null || tenantId.isBlank()) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "Organization context is required", HttpStatus.FORBIDDEN);
        }
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Internal-Key", internalKey);
        headers.set("X-Tenant-ID", tenantId);
        try {
            Map<String, Object> body = restTemplate.exchange(
                    chitServiceUrl + "/internal/chits/" + chitId + "/draws/" + monthNumber
                            + "/winners/" + memberId,
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    Map.class).getBody();
            if (body == null || !(body.get("data") instanceof Map<?, ?> data)) {
                throw unavailable("Winner service returned an invalid response", null);
            }
            WinnerDto result = new WinnerDto();
            result.setWinnerCount(parseInt(data.get("winnerCount")));
            if (result.getWinnerCount() == 1) {
                result.setId(parseUuid(data.get("id")));
                result.setChitId(parseUuid(data.get("chitId")));
                result.setMemberId(parseUuid(data.get("memberId")));
                result.setMonthNumber(parseInt(data.get("monthNumber")));
                result.setWinningAmount(parseMoney(data.get("winningAmount")));
                result.setAuctionDiscountAmount(parseMoney(data.get("auctionDiscountAmount")));
                if (!chitId.equals(result.getChitId()) || !memberId.equals(result.getMemberId())
                        || monthNumber != result.getMonthNumber() || result.getWinningAmount() == null) {
                    throw unavailable("Winner service returned data outside the requested scope", null);
                }
            }
            return result;
        } catch (RestClientException e) {
            log.error("Failed to verify payout winner for chit {} month {}: {}",
                    chitId, monthNumber, e.getClass().getSimpleName());
            throw unavailable("Winner record could not be verified. Please try again.", e);
        }
    }

    /**
     * Returns the chit's durationMonths so payout-service can check if all draws are done.
     * Returns -1 on error so the caller can skip the completion check safely.
     */
    public int getChitDurationMonths(UUID chitId, String tenantId) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Internal-Key", internalKey);
        headers.set("X-Tenant-ID", tenantId);

        try {
            @SuppressWarnings("unchecked")
            java.util.Map<String, Object> body = restTemplate.exchange(
                    chitServiceUrl + "/internal/chits/" + chitId,
                    org.springframework.http.HttpMethod.GET,
                    new HttpEntity<>(null, headers),
                    new org.springframework.core.ParameterizedTypeReference<java.util.Map<String, Object>>() {}
            ).getBody();

            if (body != null && body.get("data") instanceof java.util.Map) {
                @SuppressWarnings("unchecked")
                java.util.Map<String, Object> data = (java.util.Map<String, Object>) body.get("data");
                Object months = data.get("durationMonths");
                if (months instanceof Number) return ((Number) months).intValue();
            }
        } catch (Exception e) {
            log.error("Failed to fetch durationMonths for chit {} — {}", chitId, e.getMessage());
        }
        return -1;
    }

    /**
     * Signals chit-service that all draws for this chit are disbursed — it should mark the chit COMPLETED.
     * Fire-and-forget: a failure here is logged but never fails the disbursement itself.
     * Chit-service guards against duplicate calls (COMPLETED → COMPLETED is a no-op).
     */
    public void markChitCompleted(UUID chitId, String tenantId) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Internal-Key", internalKey);
        headers.set("X-Tenant-ID", tenantId);

        try {
            restTemplate.postForObject(
                    chitServiceUrl + "/internal/chits/" + chitId + "/complete",
                    new HttpEntity<>(null, headers),
                    Void.class
            );
            log.info("Chit {} marked COMPLETED via internal call — all draws disbursed", chitId);
        } catch (Exception e) {
            log.error("Failed to auto-complete chit {} — chit may need manual completion: {}", chitId, e.getMessage());
        }
    }

    private int parseInt(Object value) {
        if (value == null) return 0;
        try { return Integer.parseInt(value.toString()); }
        catch (NumberFormatException e) { throw unavailable("Winner service returned an invalid number", e); }
    }

    private UUID parseUuid(Object value) {
        if (value == null) return null;
        try { return UUID.fromString(value.toString()); }
        catch (IllegalArgumentException e) { throw unavailable("Winner service returned an invalid identifier", e); }
    }

    private BigDecimal parseMoney(Object value) {
        if (value == null) return null;
        try { return new BigDecimal(value.toString()); }
        catch (NumberFormatException e) { throw unavailable("Winner service returned an invalid amount", e); }
    }

    private BusinessException unavailable(String message, Exception cause) {
        BusinessException exception = new BusinessException(
                ErrorCode.INTERNAL_SERVER_ERROR, message, HttpStatus.SERVICE_UNAVAILABLE);
        if (cause != null) exception.initCause(cause);
        return exception;
    }
}
