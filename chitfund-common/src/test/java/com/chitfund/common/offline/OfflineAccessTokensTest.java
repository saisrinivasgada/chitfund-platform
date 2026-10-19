package com.chitfund.common.offline;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;

class OfflineAccessTokensTest {
    private static final String SECRET = "test-offline-secret-at-least-thirty-two-characters";
    private static final Instant NOW = Instant.parse("2026-10-15T12:00:00Z");
    private final OfflineAccessTokens tokens = at(NOW);

    @Test
    void rotationRetainsHistoricalEvidenceAndNewGrantsUseTheCurrentKey() {
        var first = new OfflineAccessTokens("offline-2026", SECRET, Map.of(), null, Clock.fixed(NOW, ZoneOffset.UTC));
        var saved = first.issue("a", "t", "ADMIN", null);
        String replacement = "replacement-offline-secret-at-least-thirty-two-characters";
        var rotated = new OfflineAccessTokens("offline-2027", replacement, Map.of("offline-2026", SECRET), null,
                Clock.fixed(NOW.plus(Duration.ofDays(365)), ZoneOffset.UTC));
        assertThat(rotated.verifyRecordedAction(saved.token(), "a", "t", "ADMIN", "RECORD_PAYMENT", NOW).id()).isEqualTo(saved.id());
        var fresh = rotated.issue("a", "t", "ADMIN", null);
        assertThat(rotated.verifyRecordedAction(fresh.token(), "a", "t", "ADMIN", "READ", NOW.plus(Duration.ofDays(365))).id()).isEqualTo(fresh.id());
        assertThatThrownBy(() -> first.verifyRecordedAction(fresh.token(), "a", "t", "ADMIN", "READ", NOW.plus(Duration.ofDays(365))))
                .isInstanceOf(io.jsonwebtoken.UnsupportedJwtException.class);
    }

    @Test
    void verificationOnlyConfigurationNeverIssuesNewAuthorityButKeepsSavedWorkVerifiable() {
        var original = new OfflineAccessTokens("old", SECRET, Map.of(), null, Clock.fixed(NOW, ZoneOffset.UTC));
        var grant = original.issue("a", "t", "ADMIN", null);
        var verifyOnly = new OfflineAccessTokens("unused", "", Map.of("old", SECRET), null,
                Clock.fixed(NOW.plus(Duration.ofDays(365)), ZoneOffset.UTC));
        assertThat(verifyOnly.canIssue()).isFalse();
        assertThatThrownBy(() -> verifyOnly.issue("a", "t", "ADMIN", null)).isInstanceOf(IllegalStateException.class);
        assertThat(verifyOnly.verifyRecordedAction(grant.token(), "a", "t", "ADMIN", "RECORD_PAYMENT", NOW).id()).isEqualTo(grant.id());
    }

    @Test
    void legacyEvidenceRequiresAnExplicitRetainedLegacyKey() {
        var grant = tokens.issue("a", "t", "ADMIN", null);
        var retained = new OfflineAccessTokens("new", SECRET, Map.of(), SECRET, Clock.fixed(NOW, ZoneOffset.UTC));
        assertThat(retained.verifyRecordedAction(grant.token(), "a", "t", "ADMIN", "READ", NOW).id()).isEqualTo(grant.id());
        var withoutLegacy = new OfflineAccessTokens("new", SECRET, Map.of(), null, Clock.fixed(NOW, ZoneOffset.UTC));
        assertThatThrownBy(() -> withoutLegacy.verifyRecordedAction(grant.token(), "a", "t", "ADMIN", "READ", NOW))
                .isInstanceOf(io.jsonwebtoken.UnsupportedJwtException.class);
    }

    @Test
    void changedKeysCannotReuseAnExistingKeyId() {
        assertThatThrownBy(() -> new OfflineAccessTokens("old", "different-secret-at-least-thirty-two-characters",
                Map.of("old", SECRET), null, Clock.systemUTC())).isInstanceOf(IllegalArgumentException.class);
    }

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
        var readOnly = tokens.issue("a", "t", "ADMIN", NOW);
        assertThat(readOnly.actions()).containsExactly("READ");
        assertThat(readOnly.recordUntil()).isEqualTo(NOW.toEpochMilli());
        assertThat(readOnly.readUntil()).isEqualTo(NOW.plus(Duration.ofDays(7)).toEpochMilli());
        assertThat(tokens.verifyRecordedAction(readOnly.token(), "a", "t", "ADMIN", "READ", NOW).id()).isEqualTo(readOnly.id());
        assertThatThrownBy(() -> tokens.verifyRecordedAction(readOnly.token(), "a", "t", "ADMIN", "RECORD_PAYMENT", NOW))
                .isInstanceOf(IllegalArgumentException.class);
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
