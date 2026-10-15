package com.chitfund.common.logging;

import org.slf4j.MDC;

/**
 * Privacy-safe request context copied into durable audit events.
 *
 * The device token itself is never exposed here: {@link MdcLoggingFilter}
 * stores only its SHA-256 fingerprint in MDC.
 */
public record AuditRequestContext(
        String correlationId,
        String source,
        String actorIp,
        String idempotencyKey,
        String deviceSessionHash
) {
    public static AuditRequestContext current() {
        return new AuditRequestContext(
                blankToNull(MDC.get("requestId")),
                valueOrDefault(MDC.get("source"), "UNKNOWN"),
                blankToNull(MDC.get("ip")),
                blankToNull(MDC.get("idempotencyKey")),
                blankToNull(MDC.get("deviceSessionHash")));
    }

    public String correlationIdOr(String explicitValue) {
        return firstNonBlank(explicitValue, correlationId);
    }

    public String sourceOr(String explicitValue) {
        return firstNonBlank(explicitValue, source);
    }

    public String idempotencyKeyOr(String explicitValue) {
        return firstNonBlank(explicitValue, idempotencyKey);
    }

    public String deviceSessionHashOr(String explicitValue) {
        return firstNonBlank(explicitValue, deviceSessionHash);
    }

    private static String firstNonBlank(String first, String second) {
        String normalized = blankToNull(first);
        return normalized != null ? normalized : blankToNull(second);
    }

    private static String valueOrDefault(String value, String fallback) {
        String normalized = blankToNull(value);
        return normalized != null ? normalized : fallback;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
