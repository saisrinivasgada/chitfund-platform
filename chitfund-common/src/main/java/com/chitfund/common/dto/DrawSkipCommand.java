package com.chitfund.common.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.util.UUID;

/** Trusted service envelope; public clients supply only the request. */
public record DrawSkipCommand(@NotNull UUID commandId, @NotNull UUID actorId,
                              @NotNull @Pattern(regexp = "ADMIN|MANAGER") String actorRole,
                              @Valid @NotNull DrawSkipRequest request, boolean scheduleOnly) {
    public DrawSkipCommand(UUID commandId, UUID actorId, String actorRole, DrawSkipRequest request) {
        this(commandId, actorId, actorRole, request, false);
    }
    public String fingerprint() {
        try {
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                    .digest((request.fingerprint() + (scheduleOnly ? ":SHIFT" : ":SKIP")).getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
}
