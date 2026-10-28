package com.chitfund.common.dto;

import jakarta.validation.constraints.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

@Data
public class DrawSkipRequest {
    private UUID attemptId;
    @NotNull private UUID chitId;
    @NotNull @Min(1) private Integer monthNumber;
    @NotNull private LocalDate dueDate;
    @NotNull @DecimalMin("0.01") private BigDecimal installmentAmount;
    @NotNull @Size(min = 3, max = 500) private String skipReason;
    @NotNull private List<@NotNull UUID> memberIds;

    /** Stable across client retries, decimal scale and member ordering. */
    public String fingerprint() {
        String members = memberIds.stream().map(UUID::toString).sorted().collect(java.util.stream.Collectors.joining(","));
        String text = chitId + "|" + monthNumber + "|" + dueDate + "|" + installmentAmount.stripTrailingZeros().toPlainString()
                + "|" + members + "|" + skipReason;
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
}
