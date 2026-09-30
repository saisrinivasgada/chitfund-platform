package com.chitfund.common.plan;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import org.springframework.http.HttpStatus;

import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.Arrays;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** Shared fail-closed validation for the user-service effective-limits contract. */
public final class PlanEntitlementVerifier {

    private PlanEntitlementVerifier() { }

    public static void requireActiveSubscription(Map<String, Object> limits) {
        if (limits == null) throw unavailable();
        Object rawStatus = limits.get("tenantStatus");
        if (!(rawStatus instanceof String status) || status.isBlank()) throw invalid();
        String normalizedStatus = status.trim().toUpperCase(Locale.ROOT);
        if (!Set.of("ACTIVE", "PENDING", "SUSPENDED", "REJECTED").contains(normalizedStatus)) {
            throw invalid();
        }
        if (!"ACTIVE".equals(normalizedStatus)) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "Organization is " + normalizedStatus.toLowerCase(Locale.ROOT)
                            + ". Contact ChitWise support to restore access.",
                    HttpStatus.FORBIDDEN);
        }

        Object expiresAtRaw = limits.get("planExpiresAt");
        if (expiresAtRaw == null) return;
        try {
            if (LocalDateTime.parse(expiresAtRaw.toString()).isBefore(LocalDateTime.now())) {
                throw new BusinessException(ErrorCode.PLAN_EXPIRED,
                        "Your subscription has expired. Please renew your plan to continue.");
            }
        } catch (DateTimeParseException invalidPlanData) {
            throw invalid();
        }
    }

    public static int requireLimit(Map<String, Object> limits, String key) {
        if (limits == null) throw unavailable();
        Object raw = limits.get(key);
        if (!(raw instanceof Number number)) throw invalid();
        long value = number.longValue();
        if (value < -1 || value > Integer.MAX_VALUE
                || Double.compare(number.doubleValue(), (double) value) != 0) {
            throw invalid();
        }
        return (int) value;
    }

    public static Set<String> requireCsvValues(Map<String, Object> limits, String key,
                                                Set<String> allowedValues) {
        if (limits == null) throw unavailable();
        Object raw = limits.get(key);
        if (!(raw instanceof String csv) || csv.isBlank()) throw invalid();
        Set<String> values = Arrays.stream(csv.split(","))
                .map(String::trim)
                .map(value -> value.toUpperCase(Locale.ROOT))
                .filter(value -> !value.isBlank())
                .collect(Collectors.toUnmodifiableSet());
        if (values.isEmpty() || !allowedValues.containsAll(values)) throw invalid();
        return values;
    }

    public static BusinessException unavailable() {
        return new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR,
                "Subscription could not be verified. Please try again.",
                HttpStatus.SERVICE_UNAVAILABLE);
    }

    private static BusinessException invalid() {
        return new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR,
                "Subscription data is invalid. Please contact support.",
                HttpStatus.SERVICE_UNAVAILABLE);
    }
}
