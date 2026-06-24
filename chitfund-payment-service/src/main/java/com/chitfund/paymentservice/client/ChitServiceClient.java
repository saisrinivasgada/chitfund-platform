package com.chitfund.paymentservice.client;

import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Internal HTTP client for calling chit-service from payment-service.
 *
 * WHY RestTemplate (not Feign)?
 * Same rationale as MemberServiceClient: payment-service is servlet-stack,
 * RestTemplate is simpler for a handful of sync calls. X-Internal-Key header
 * authenticates service-to-service calls without requiring a user JWT.
 *
 * WHY separate DTOs here instead of sharing from chit-service?
 * Database-per-service pattern: we don't want payment-service to depend on
 * chit-service's domain classes. These local DTOs decouple the services —
 * chit-service can evolve its response format without breaking payment-service
 * as long as the field names we care about stay stable.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ChitServiceClient {

    private final RestTemplate restTemplate;

    @Value("${app.chit-service-url:http://localhost:8082}")
    private String chitServiceUrl;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    // ─────────────────────────────────────────────────────────────────────────
    // DTOs — local projections of chit-service responses
    // ─────────────────────────────────────────────────────────────────────────

    @Data
    public static class EnrollmentDto {
        private UUID id;
        private UUID chitId;
        private UUID memberId;
        private LocalDateTime enrolledAt;
        private boolean active;
    }

    @Data
    public static class ChitDto {
        private UUID id;
        private String name;
        private String status;
        private BigDecimal chitValue;
        private BigDecimal installmentAmount;
        private Integer totalMembers;
        private Integer durationMonths;
        private boolean postPayoutContributionEnabled;
        private BigDecimal defaultPostPayoutContribution;
    }

    @Data
    public static class ReservationDto {
        private UUID id;
        private UUID chitId;
        private UUID memberId;
        private Integer monthNumber;
        private LocalDate reservationMonth;
        private BigDecimal payoutAmount;
        private BigDecimal postPayoutContribution;
        private String status;   // RESERVED / UNALLOCATED / PROCESSED / VOIDED
        private String voidReason;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // API calls
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Returns ALL enrollments for a member (active and inactive) across all chits.
     * Calls the internal endpoint added to chit-service for settlement.
     */
    public List<EnrollmentDto> getEnrollmentsForMember(UUID memberId) {
        try {
            HttpHeaders headers = buildHeaders();
            ResponseEntity<Map<String, Object>> resp = restTemplate.exchange(
                    chitServiceUrl + "/internal/enrollments/member/" + memberId,
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    new ParameterizedTypeReference<>() {});

            return extractDataList(resp, EnrollmentDto.class);
        } catch (RestClientException e) {
            log.warn("chit-service unreachable for enrollments of member {}: {}", memberId, e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * Returns full chit details by ID.
     */
    @SuppressWarnings("unchecked")
    public ChitDto getChit(UUID chitId) {
        try {
            HttpHeaders headers = buildHeaders();
            ResponseEntity<Map> resp = restTemplate.exchange(
                    chitServiceUrl + "/internal/chits/" + chitId,
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    Map.class);

            Map<String, Object> body = resp.getBody();
            if (body == null) return null;
            Object data = body.get("data");
            if (!(data instanceof Map)) return null;
            return mapToChitDto((Map<String, Object>) data);
        } catch (RestClientException e) {
            log.warn("chit-service unreachable for chit {}: {}", chitId, e.getMessage());
            return null;
        }
    }

    /**
     * Returns ALL MonthReservation rows for a member within a specific chit.
     * Includes RESERVED, PROCESSED, and VOIDED rows so the service can pick RESERVED ones.
     */
    public List<ReservationDto> getReservationsForMemberInChit(UUID chitId, UUID memberId) {
        try {
            HttpHeaders headers = buildHeaders();
            ResponseEntity<Map<String, Object>> resp = restTemplate.exchange(
                    chitServiceUrl + "/internal/reservations/chit/" + chitId + "/member/" + memberId,
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    new ParameterizedTypeReference<>() {});

            return extractDataList(resp, ReservationDto.class);
        } catch (RestClientException e) {
            log.warn("chit-service unreachable for reservations of member {} in chit {}: {}",
                    memberId, chitId, e.getMessage());
            return Collections.emptyList();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private HttpHeaders buildHeaders() {
        HttpHeaders h = new HttpHeaders();
        h.set("X-Internal-Key", internalKey);
        return h;
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private <T> List<T> extractDataList(ResponseEntity<Map<String, Object>> resp, Class<T> type) {
        Map<String, Object> body = resp.getBody();
        if (body == null) return Collections.emptyList();
        Object data = body.get("data");
        if (!(data instanceof List)) return Collections.emptyList();

        List<Map<String, Object>> rawList = (List<Map<String, Object>>) data;
        List<T> result = new java.util.ArrayList<>();
        for (Map<String, Object> raw : rawList) {
            result.add(mapToDto(raw, type));
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private <T> T mapToDto(Map<String, Object> raw, Class<T> type) {
        if (type == EnrollmentDto.class) {
            EnrollmentDto dto = new EnrollmentDto();
            dto.setId(parseUuid(raw.get("id")));
            dto.setChitId(parseUuid(raw.get("chitId")));
            dto.setMemberId(parseUuid(raw.get("memberId")));
            dto.setActive(Boolean.TRUE.equals(raw.get("active")));
            return (T) dto;
        }
        if (type == ReservationDto.class) {
            ReservationDto dto = new ReservationDto();
            dto.setId(parseUuid(raw.get("id")));
            dto.setChitId(parseUuid(raw.get("chitId")));
            dto.setMemberId(parseUuid(raw.get("memberId")));
            dto.setMonthNumber(parseInteger(raw.get("monthNumber")));
            dto.setPayoutAmount(parseBigDecimal(raw.get("payoutAmount")));
            dto.setPostPayoutContribution(parseBigDecimal(raw.get("postPayoutContribution")));
            dto.setStatus(raw.get("status") != null ? raw.get("status").toString() : null);
            dto.setVoidReason(raw.get("voidReason") != null ? raw.get("voidReason").toString() : null);
            Object rm = raw.get("reservationMonth");
            if (rm != null) {
                try { dto.setReservationMonth(LocalDate.parse(rm.toString().substring(0, 10))); }
                catch (Exception ignored) {}
            }
            return (T) dto;
        }
        throw new IllegalArgumentException("Unknown DTO type: " + type);
    }

    @SuppressWarnings("unchecked")
    private ChitDto mapToChitDto(Map<String, Object> raw) {
        ChitDto dto = new ChitDto();
        dto.setId(parseUuid(raw.get("id")));
        dto.setName(raw.get("name") != null ? raw.get("name").toString() : null);
        dto.setStatus(raw.get("status") != null ? raw.get("status").toString() : null);
        dto.setChitValue(parseBigDecimal(raw.get("chitValue")));
        dto.setInstallmentAmount(parseBigDecimal(raw.get("installmentAmount")));
        dto.setTotalMembers(parseInteger(raw.get("totalMembers")));
        dto.setDurationMonths(parseInteger(raw.get("durationMonths")));
        dto.setPostPayoutContributionEnabled(Boolean.TRUE.equals(raw.get("postPayoutContributionEnabled")));
        dto.setDefaultPostPayoutContribution(parseBigDecimal(raw.get("defaultPostPayoutContribution")));
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

    private Integer parseInteger(Object val) {
        if (val == null) return null;
        try { return Integer.parseInt(val.toString()); } catch (Exception e) { return null; }
    }
}
