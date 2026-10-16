package com.chitfund.common.offline;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;

/**
 * Offline grants never authenticate HTTP requests: they use a separate signing key.
 * The recording deadline bounds new work, not the lifetime of evidence for saved work.
 * Callers must separately verify the current session and permission to reconcile.
 */
public final class OfflineAccessTokens {
    public static final Duration RECORDING_WINDOW = Duration.ofDays(7);
    private static final String PURPOSE = "CHITWISE_OFFLINE_V1";
    private final SecretKey key;
    private final Clock clock;

    public record Grant(String id, String actorId, String tenantId, String role,
                        long issuedAt, long recordUntil,
                        List<String> actions, String token) { }

    public OfflineAccessTokens(String signingSecret, Clock clock) {
        if (signingSecret == null || signingSecret.length() < 32) {
            throw new IllegalArgumentException("Offline access requires a strong signing secret");
        }
        try {
            // Domain separation prevents an offline grant from being accepted
            // as an access JWT, even though services share the access-JWT secret.
            byte[] separated = MessageDigest.getInstance("SHA-256").digest(
                    (PURPOSE + ":" + signingSecret).getBytes(StandardCharsets.UTF_8));
            this.key = Keys.hmacShaKeyFor(separated);
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
        this.clock = clock;
    }

    public Grant issue(String actorId, String tenantId, String role, Instant planExpiry) {
        Instant issued = clock.instant();
        Instant recordUntil = issued.plus(RECORDING_WINDOW);
        if (planExpiry != null && planExpiry.isBefore(recordUntil)) recordUntil = planExpiry;
        if (!recordUntil.isAfter(issued)) throw new IllegalArgumentException("Subscription has expired");
        List<String> actions = switch (role) {
            case "ADMIN" -> List.of("READ", "RECORD_PAYMENT");
            case "MANAGER", "STAFF" -> List.of("READ", "COLLECT_CASH", "MARK_PICKUP", "PARTIAL_COLLECT");
            case "MEMBER" -> List.of("READ");
            default -> throw new IllegalArgumentException("This role does not support offline access");
        };
        String id = UUID.randomUUID().toString();
        String token = Jwts.builder().id(id).subject(actorId)
                .claim("purpose", PURPOSE).claim("tenantId", tenantId).claim("role", role)
                .claim("recordFrom", issued.toEpochMilli())
                .claim("recordUntil", recordUntil.toEpochMilli()).claim("actions", actions)
                // No JWT expiry: old evidence must remain verifiable after a long
                // disconnection. It never grants permission to record new work.
                .issuedAt(Date.from(issued))
                .signWith(key).compact();
        return new Grant(id, actorId, tenantId, role, issued.toEpochMilli(),
                recordUntil.toEpochMilli(), actions, token);
    }

    public Grant verifyRecordedAction(String token, String actorId, String tenantId, String role,
                                      String action, Instant recordedAt) {
        Claims claims = Jwts.parser().verifyWith(key)
                .clock(() -> Date.from(clock.instant())).build().parseSignedClaims(token).getPayload();
        if (!PURPOSE.equals(claims.get("purpose", String.class))
                || !actorId.equals(claims.getSubject())
                || !tenantId.equals(claims.get("tenantId", String.class))
                || !role.equals(claims.get("role", String.class))) {
            throw new IllegalArgumentException("Offline grant belongs to a different account or organisation");
        }
        List<?> rawActions = claims.get("actions", List.class);
        if (rawActions == null || !rawActions.contains(action)) {
            throw new IllegalArgumentException("Offline grant does not permit this action");
        }
        Instant issuedAt = Instant.ofEpochMilli(claims.get("recordFrom", Number.class).longValue());
        Instant recordUntil = Instant.ofEpochMilli(claims.get("recordUntil", Number.class).longValue());
        if (recordedAt == null || recordedAt.isBefore(issuedAt) || !recordedAt.isBefore(recordUntil)
                || recordedAt.isAfter(clock.instant().plus(Duration.ofMinutes(5)))) {
            throw new IllegalArgumentException("Payment was not recorded within its offline authorisation window");
        }
        List<String> actions = rawActions.stream().map(String.class::cast).toList();
        return new Grant(claims.getId(), actorId, tenantId, role,
                issuedAt.toEpochMilli(), recordUntil.toEpochMilli(), actions, token);
    }
}
