package com.chitfund.userservice.util;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/** Canonical validation shared by standard-plan and custom-plan writes. */
public final class PlanInputValidator {
    private static final Set<String> SUPPORTED_CHIT_TYPES =
            Set.of("RESERVATION", "LOTTERY", "AUCTION");

    private PlanInputValidator() {}

    public static String normalizeAllowedChitTypes(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "At least one allowed chit type is required");
        }
        LinkedHashSet<String> normalized = Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .map(value -> value.toUpperCase(Locale.ROOT))
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (normalized.isEmpty() || !SUPPORTED_CHIT_TYPES.containsAll(normalized)) {
            Set<String> invalid = new LinkedHashSet<>(normalized);
            invalid.removeAll(SUPPORTED_CHIT_TYPES);
            String detail = invalid.isEmpty() ? "none supplied" : String.join(", ", invalid);
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Unsupported chit types: " + detail
                            + ". Allowed values are RESERVATION, LOTTERY and AUCTION");
        }
        return String.join(",", normalized);
    }
}
