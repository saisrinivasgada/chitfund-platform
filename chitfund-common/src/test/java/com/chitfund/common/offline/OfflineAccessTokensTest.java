package com.chitfund.common.offline;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.*;

class OfflineAccessTokensTest {
    private static final String SECRET = "test-offline-secret-at-least-thirty-two-characters";
    private static final Instant NOW = Instant.parse("2026-10-15T12:00:00Z");
    private final OfflineAccessTokens tokens = at(NOW);

    private OfflineAccessTokens at(Instant now) {
        return new OfflineAccessTokens(SECRET, Clock.fixed(now, ZoneOffset.UTC));
    }

    @Test
    void recordingWindowIsSevenDaysButSavedPaymentsHaveNoSyncDeadline() {
        var grant = tokens.issue("actor-a", "org-a", "ADMIN", null);
        assertThat(grant.recordUntil()).isEqualTo(NOW.plus(Duration.ofDays(7)).toEpochMilli());
        for (int daysLater : new int[]{9, 14, 31, 365}) {
            assertThat(at(NOW.plus(Duration.ofDays(daysLater))).verifyRecordedAction(
                    grant.token(), "actor-a", "org-a", "ADMIN", "RECORD_PAYMENT",
                    NOW.plus(Duration.ofDays(6))).id()).isEqualTo(grant.id());
        }
        assertThatThrownBy(() -> at(NOW.plus(Duration.ofDays(365))).verifyRecordedAction(
                grant.token(), "actor-a", "org-a", "ADMIN", "RECORD_PAYMENT",
                NOW.plus(Duration.ofDays(7))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void knownSubscriptionExpiryBoundsNewOfflineWork() {
        var expiry = NOW.plus(Duration.ofDays(2));
        var grant = tokens.issue("a", "t", "ADMIN", expiry);
        assertThat(grant.recordUntil()).isEqualTo(expiry.toEpochMilli());
        var reconnect = at(NOW.plus(Duration.ofDays(90)));
        assertThat(reconnect.verifyRecordedAction(grant.token(), "a", "t", "ADMIN", "RECORD_PAYMENT",
                expiry.minusMillis(1)).id()).isEqualTo(grant.id());
        assertThatThrownBy(() -> reconnect.verifyRecordedAction(grant.token(), "a", "t", "ADMIN", "RECORD_PAYMENT", expiry))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> reconnect.verifyRecordedAction(grant.token(), "a", "t", "ADMIN", "RECORD_PAYMENT", expiry.plusMillis(1)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> tokens.issue("a", "t", "ADMIN", NOW)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void grantCannotCrossAccountOrganisationRoleOrAction() {
        var grant = tokens.issue("actor-a", "org-a", "MEMBER", null);
        assertThat(tokens.verifyRecordedAction(grant.token(), "actor-a", "org-a", "MEMBER", "READ", NOW).actorId()).isEqualTo("actor-a");
        assertThatThrownBy(() -> tokens.verifyRecordedAction(grant.token(), "actor-b", "org-a", "MEMBER", "READ", NOW)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> tokens.verifyRecordedAction(grant.token(), "actor-a", "org-b", "MEMBER", "READ", NOW)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> tokens.verifyRecordedAction(grant.token(), "actor-a", "org-a", "ADMIN", "READ", NOW)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> tokens.verifyRecordedAction(grant.token(), "actor-a", "org-a", "MEMBER", "RECORD_PAYMENT", NOW)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void missingEarlierAndFutureRecordingTimesAreRejected() {
        var grant = tokens.issue("a", "t", "ADMIN", null);
        assertThatThrownBy(() -> tokens.verifyRecordedAction(grant.token(), "a", "t", "ADMIN", "RECORD_PAYMENT", null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> tokens.verifyRecordedAction(grant.token(), "a", "t", "ADMIN", "RECORD_PAYMENT", NOW.minusMillis(1)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> tokens.verifyRecordedAction(grant.token(), "a", "t", "ADMIN", "RECORD_PAYMENT", NOW.plusSeconds(301)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void offlineGrantIsNotAnHttpAccessTokenAndRejectsTampering() {
        var grant = tokens.issue("a", "t", "ADMIN", null);
        assertThatThrownBy(() -> Jwts.parser().verifyWith(Keys.hmacShaKeyFor(
                SECRET.getBytes(StandardCharsets.UTF_8))).build().parseSignedClaims(grant.token()))
                .isInstanceOf(io.jsonwebtoken.security.SignatureException.class);
        String[] parts = grant.token().split("\\.");
        String changed = parts[0] + "." + parts[1] + "." + (parts[2].startsWith("A") ? "B" : "A") + parts[2].substring(1);
        assertThatThrownBy(() -> tokens.verifyRecordedAction(changed, "a", "t", "ADMIN", "READ", NOW))
                .isInstanceOf(io.jsonwebtoken.security.SignatureException.class);
    }
}
