package com.chitfund.common.offline;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.ProtectedHeader;
import io.jsonwebtoken.UnsupportedJwtException;
import io.jsonwebtoken.security.Keys;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.HashMap;
import java.util.Map;
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
    private final String keyId;
    private final Map<String, SecretKey> verificationKeys;
    private final SecretKey legacyVerificationKey;
    private final Clock clock;

    public record Grant(String id, String actorId, String tenantId, String role,
                        long issuedAt, long recordUntil, long readUntil,
                        List<String> actions, String token) { }

    public OfflineAccessTokens(String signingSecret, Clock clock) {
        this.key = separatedKey(signingSecret);
        this.keyId = null;
        this.verificationKeys = Map.of();
        this.legacyVerificationKey = key;
        this.clock = clock;
    }

    /** Old keys are verification-only and must remain available for delayed work. */
    public OfflineAccessTokens(String activeKeyId, String signingSecret, Map<String, String> retainedSecrets,
                               String legacySecret, Clock clock) {
        Map<String, SecretKey> keys = new HashMap<>();
        retainedSecrets.forEach((id, secret) -> {
            validateKeyId(id);
            keys.put(id, separatedKey(secret));
        });
        if (signingSecret != null && !signingSecret.isBlank()) {
            validateKeyId(activeKeyId);
            if (retainedSecrets.containsKey(activeKeyId) && !signingSecret.equals(retainedSecrets.get(activeKeyId))) {
                throw new IllegalArgumentException("An offline signing key ID cannot be reused for a different key");
            }
            this.key = separatedKey(signingSecret);
            this.keyId = activeKeyId;
            keys.put(activeKeyId, key);
        } else {
            this.key = null;
            this.keyId = null;
        }
        this.verificationKeys = Map.copyOf(keys);
        this.legacyVerificationKey = legacySecret == null || legacySecret.isBlank() ? null : separatedKey(legacySecret);
        this.clock = clock;
    }

    public boolean canIssue() { return key != null; }

    private static void validateKeyId(String id) {
        if (id == null || !id.matches("[A-Za-z0-9._-]{1,64}")) {
            throw new IllegalArgumentException("Offline signing key ID must be a short stable identifier");
        }
    }

    private static SecretKey separatedKey(String signingSecret) {
        if (signingSecret == null || signingSecret.length() < 32) {
            throw new IllegalArgumentException("Offline access requires a strong signing secret");
        }
        try {
            // Domain separation prevents an offline grant from being accepted
            // as an access JWT, even though services share the access-JWT secret.
            byte[] separated = MessageDigest.getInstance("SHA-256").digest(
                    (PURPOSE + ":" + signingSecret).getBytes(StandardCharsets.UTF_8));
            return Keys.hmacShaKeyFor(separated);
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    public Grant issue(String actorId, String tenantId, String role, Instant planExpiry) {
        if (!canIssue()) throw new IllegalStateException("Offline recording is not configured");
        Instant issued = clock.instant();
        Instant recordUntil = issued.plus(RECORDING_WINDOW);
        if (planExpiry != null && planExpiry.isBefore(recordUntil)) recordUntil = planExpiry;
        Instant readUntil = issued.plus(RECORDING_WINDOW);
        List<String> actions = switch (role) {
            case "ADMIN" -> List.of("READ", "RECORD_PAYMENT");
            case "MANAGER", "STAFF" -> List.of("READ", "COLLECT_CASH", "MARK_PICKUP", "PARTIAL_COLLECT");
            case "MEMBER" -> List.of("READ");
            default -> throw new IllegalArgumentException("This role does not support offline access");
        };
        if (!recordUntil.isAfter(issued)) actions = List.of("READ");
        String id = UUID.randomUUID().toString();
        var builder = Jwts.builder().id(id).subject(actorId)
                .claim("purpose", PURPOSE).claim("tenantId", tenantId).claim("role", role)
                .claim("recordFrom", issued.toEpochMilli())
                .claim("recordUntil", recordUntil.toEpochMilli()).claim("readUntil", readUntil.toEpochMilli()).claim("actions", actions)
                // No JWT expiry: old evidence must remain verifiable after a long
                // disconnection. It never grants permission to record new work.
                .issuedAt(Date.from(issued));
        if (keyId != null) builder.header().keyId(keyId).and();
        String token = builder.signWith(key).compact();
        return new Grant(id, actorId, tenantId, role, issued.toEpochMilli(),
                recordUntil.toEpochMilli(), readUntil.toEpochMilli(), actions, token);
    }

    public Grant verifyRecordedAction(String token, String actorId, String tenantId, String role,
                                      String action, Instant recordedAt) {
        Claims claims = Jwts.parser().keyLocator(header -> {
                    if (!(header instanceof ProtectedHeader protectedHeader)) throw new UnsupportedJwtException("Signed offline evidence is required");
                    String id = protectedHeader.getKeyId();
                    SecretKey verifyingKey = id == null ? legacyVerificationKey : verificationKeys.get(id);
                    if (verifyingKey == null) throw new UnsupportedJwtException("Offline verification key is unavailable; the saved payment needs review");
                    return verifyingKey;
                })
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
        Number readUntilClaim = claims.get("readUntil", Number.class);
        Instant readUntil = readUntilClaim == null ? recordUntil : Instant.ofEpochMilli(readUntilClaim.longValue());
        Instant actionUntil = "READ".equals(action) ? readUntil : recordUntil;
        if (recordedAt == null || recordedAt.isBefore(issuedAt) || !recordedAt.isBefore(actionUntil)
                || recordedAt.isAfter(clock.instant().plus(Duration.ofMinutes(5)))) {
            throw new IllegalArgumentException("Payment was not recorded within its offline authorisation window");
        }
        List<String> actions = rawActions.stream().map(String.class::cast).toList();
        return new Grant(claims.getId(), actorId, tenantId, role,
                issuedAt.toEpochMilli(), recordUntil.toEpochMilli(), readUntil.toEpochMilli(), actions, token);
    }
}
