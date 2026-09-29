package com.chitfund.payoutservice.service;

import com.chitfund.payoutservice.dto.request.CreatePayoutRequest;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

final class PayoutIdempotencyFingerprint {

    private PayoutIdempotencyFingerprint() {
    }

    static String of(Object... values) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            for (Object value : values) {
                String normalized = normalize(value);
                byte[] bytes = normalized.getBytes(StandardCharsets.UTF_8);
                digest.update(Integer.toString(bytes.length).getBytes(StandardCharsets.US_ASCII));
                digest.update((byte) ':');
                digest.update(bytes);
                digest.update((byte) ';');
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    static String forCreation(CreatePayoutRequest request) {
        String installments = request.getInstallmentMonthBreakdown() == null ? "<none>"
                : request.getInstallmentMonthBreakdown().stream()
                        .map(item -> item == null ? "<null>"
                                : item.getMonth() + ":" + normalize(item.getAmount()))
                        .sorted()
                        .reduce((left, right) -> left + "," + right).orElse("<none>");
        String crossChits = request.getCrossChitDeductions() == null ? "<none>"
                : request.getCrossChitDeductions().stream()
                        .map(item -> item == null ? "<null>"
                                : item.getChitId() + ":" + normalize(item.getAmount()))
                        .sorted()
                        .reduce((left, right) -> left + "," + right).orElse("<none>");
        return of(request.getChitId(), request.getMemberId(), request.getMonthNumber(),
                request.getWinningAmount(), request.getDiscountAmount(),
                request.getInstallmentSettlement(), request.getCrossChitSettlement(),
                request.getManualAdjustment(), installments, request.getNotes(),
                request.getCollectCurrentMonthInstallment(), crossChits);
    }

    private static String normalize(Object value) {
        if (value == null) return "<null>";
        if (value instanceof BigDecimal decimal) {
            return decimal.stripTrailingZeros().toPlainString();
        }
        return value.toString();
    }
}
