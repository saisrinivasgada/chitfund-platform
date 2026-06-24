package com.chitfund.paymentservice.client;

import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * Internal HTTP client for calling payout-service from payment-service.
 * Used exclusively by SettlementService to fetch the relevant Payout for a member+chit.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class PayoutServiceClient {

    private final RestTemplate restTemplate;

    @Value("${app.payout-service-url:http://localhost:8085}")
    private String payoutServiceUrl;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    @Data
    public static class PayoutDto {
        private UUID id;
        private UUID chitId;
        private UUID memberId;
        private int monthNumber;
        private BigDecimal winningAmount;
        private BigDecimal discountAmount;
        private BigDecimal netPayoutAmount;
        private BigDecimal disbursedAmount;
        private String status;  // PENDING / PARTIALLY_DISBURSED / DISBURSED / CANCELLED / VOIDED
    }

    /**
     * Returns the most relevant payout for a member+chit pair.
     * payout-service's internal endpoint prefers DISBURSED/PARTIALLY_DISBURSED over PENDING,
     * and excludes CANCELLED/VOIDED.
     *
     * Returns null if no relevant payout exists or if payout-service is unreachable.
     */
    @SuppressWarnings("unchecked")
    public PayoutDto getPayoutForMemberInChit(UUID memberId, UUID chitId) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("X-Internal-Key", internalKey);

            ResponseEntity<Map> resp = restTemplate.exchange(
                    payoutServiceUrl + "/internal/payouts/member/" + memberId + "/chit/" + chitId,
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    Map.class);

            Map<String, Object> body = resp.getBody();
            if (body == null) return null;
            Object data = body.get("data");
            if (!(data instanceof Map)) return null;
            return mapToPayoutDto((Map<String, Object>) data);

        } catch (RestClientException e) {
            log.warn("payout-service unreachable for member {} chit {}: {}", memberId, chitId, e.getMessage());
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private PayoutDto mapToPayoutDto(Map<String, Object> raw) {
        PayoutDto dto = new PayoutDto();
        dto.setId(parseUuid(raw.get("id")));
        dto.setChitId(parseUuid(raw.get("chitId")));
        dto.setMemberId(parseUuid(raw.get("memberId")));
        Object mn = raw.get("monthNumber");
        if (mn != null) { try { dto.setMonthNumber(Integer.parseInt(mn.toString())); } catch (Exception ignored) {} }
        dto.setWinningAmount(parseBigDecimal(raw.get("winningAmount")));
        dto.setDiscountAmount(parseBigDecimal(raw.get("discountAmount")));
        dto.setNetPayoutAmount(parseBigDecimal(raw.get("netPayoutAmount")));
        dto.setDisbursedAmount(parseBigDecimal(raw.get("disbursedAmount")));
        dto.setStatus(raw.get("status") != null ? raw.get("status").toString() : null);
        return dto;
    }

    private UUID parseUuid(Object val) {
        if (val == null) return null;
        try { return UUID.fromString(val.toString()); } catch (Exception e) { return null; }
    }

    private BigDecimal parseBigDecimal(Object val) {
        if (val == null) return null;
        try { return new BigDecimal(val.toString()); } catch (Exception e) { return null; }
    }
}
