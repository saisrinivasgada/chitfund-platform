package com.chitfund.gateway.filter;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

import static com.github.tomakehurst.wiremock.client.WireMock.absent;
import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;

/**
 * HTTP-level integration test for member suspension enforcement at the gateway.
 *
 * <p>Unlike {@link JwtAuthGatewayFilterTest} which uses {@code MockServerWebExchange},
 * this test starts the full Spring Cloud Gateway on a random port and makes real HTTP
 * requests through it. WireMock simulates user-service (member-link check) and the
 * downstream service.
 *
 * <h2>Latency and availability analysis</h2>
 * Every request carrying a MEMBER-role JWT triggers a synchronous HTTP call from the
 * gateway to user-service ({@code /internal/users/member-link/check}). Implications:
 * <ul>
 *   <li><strong>P99 overhead</strong> in the same AWS AZ is ~5–15 ms per MEMBER request
 *       (one extra HTTP round-trip + JSON deserialisation).</li>
 *   <li><strong>Availability impact</strong>: user-service unavailability causes 100% of
 *       MEMBER requests to fail with {@code 503 MEMBER_ACCESS_UNAVAILABLE}. This is
 *       intentional fail-closed behaviour. The gateway must NOT bypass the check to
 *       improve availability; doing so would allow suspended members to retain access
 *       until their token expires (up to 1 hour).</li>
 *   <li><strong>Future mitigation without weakening security</strong>: a short read-through
 *       cache (e.g., 30 s TTL on {@code userId:tenantId → active=true}) that is immediately
 *       invalidated when a suspension event is published would eliminate most steady-state
 *       latency while preserving fail-closed semantics on cache miss or service outage.
 *       This optimisation is not implemented here; it is a noted planned improvement.</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWebTestClient
class MemberSuspensionGatewayIntegrationTest {

    private static final String SECRET = "gateway-integration-test-secret-at-least-32chars";
    private static final String INTERNAL_KEY = "test-internal-key";

    // Start WireMock before Spring context so @DynamicPropertySource can read the port.
    static final WireMockServer WIRE_MOCK;

    static {
        WIRE_MOCK = new WireMockServer(WireMockConfiguration.wireMockConfig().dynamicPort());
        WIRE_MOCK.start();
    }

    @AfterAll
    static void stopWireMock() {
        WIRE_MOCK.stop();
    }

    @DynamicPropertySource
    static void overrideProperties(DynamicPropertyRegistry registry) {
        String url = "http://localhost:" + WIRE_MOCK.port();
        // All downstream service URLs → WireMock (gateway needs a valid URI at startup)
        registry.add("chitwise.user-service-url", () -> url);
        registry.add("USER_SERVICE_URL", () -> url);
        registry.add("MEMBER_SERVICE_URL", () -> url);
        registry.add("CHIT_SERVICE_URL", () -> url);
        registry.add("PAYMENT_SERVICE_URL", () -> url);
        registry.add("PAYOUT_SERVICE_URL", () -> url);
        registry.add("NOTIFICATION_SERVICE_URL", () -> url);
        registry.add("REPORTING_SERVICE_URL", () -> url);
        registry.add("AUDIT_SERVICE_URL", () -> url);
        registry.add("MANAGEMENT_SERVICE_URL", () -> url);
        registry.add("jwt.secret", () -> SECRET);
        registry.add("internal.service.key", () -> INTERNAL_KEY);
    }

    @Autowired
    private WebTestClient webTestClient;

    @BeforeEach
    void resetStubs() {
        WIRE_MOCK.resetAll();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private String memberToken(String userId, String tenantId) {
        SecretKey key = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));
        return Jwts.builder()
                .subject(userId)
                .claim("role", "MEMBER")
                .claim("tenantId", tenantId)
                .claim("username", "testmember")
                .expiration(new Date(System.currentTimeMillis() + 3_600_000L))
                .signWith(key)
                .compact();
    }

    /** Stubs the member-link check to return active or suspended. */
    private void stubMemberLink(String userId, String tenantId, boolean active) {
        WIRE_MOCK.stubFor(get(urlPathEqualTo("/internal/users/member-link/check"))
                .withQueryParam("userId", equalTo(userId))
                .withQueryParam("tenantId", equalTo(tenantId))
                .willReturn(aResponse()
                        .withStatus(200)
                        .withHeader("Content-Type", "application/json")
                        .withBody("{\"active\":" + active + "}")));
    }

    /** Stubs the downstream echo endpoint. */
    private void stubDownstream() {
        WIRE_MOCK.stubFor(get(urlPathEqualTo("/api/users/ping"))
                .willReturn(aResponse()
                        .withStatus(200)
                        .withHeader("Content-Type", "application/json")
                        .withBody("{\"ok\":true}")));
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    /**
     * A member token with an active link is forwarded to the downstream service
     * and receives a 200 response.
     */
    @Test
    void memberTokenWithActiveLink_isForwarded() {
        String userId = UUID.randomUUID().toString();
        String tenantId = UUID.randomUUID().toString();
        stubMemberLink(userId, tenantId, true);
        stubDownstream();

        webTestClient.get()
                .uri("/api/users/ping")
                .header("Authorization", "Bearer " + memberToken(userId, tenantId))
                .exchange()
                .expectStatus().isOk()
                .expectBody().jsonPath("$.ok").isEqualTo(true);
    }

    /**
     * After suspension (member link absent), reusing the same already-issued token
     * must be rejected by the gateway immediately — no need to wait for token expiry.
     */
    @Test
    void memberTokenAfterSuspension_isRejectedByGateway() {
        String userId = UUID.randomUUID().toString();
        String tenantId = UUID.randomUUID().toString();
        stubMemberLink(userId, tenantId, false); // suspended: link absent
        stubDownstream();

        webTestClient.get()
                .uri("/api/users/ping")
                .header("Authorization", "Bearer " + memberToken(userId, tenantId))
                .exchange()
                .expectStatus().isUnauthorized()
                .expectBody()
                .jsonPath("$.success").isEqualTo(false)
                .jsonPath("$.errorCode").isEqualTo("AUTH_001");
    }

    /**
     * Suspending org A must not affect a valid member token in org B
     * (cross-tenant isolation).
     */
    @Test
    void orgBMemberToken_remainsAccessibleAfterOrgASuspension() {
        String userIdA = UUID.randomUUID().toString();
        String tenantIdA = UUID.randomUUID().toString();
        String userIdB = UUID.randomUUID().toString();
        String tenantIdB = UUID.randomUUID().toString();

        stubMemberLink(userIdA, tenantIdA, false); // org A: suspended
        stubMemberLink(userIdB, tenantIdB, true);  // org B: active
        stubDownstream();

        // Org A token is rejected
        webTestClient.get()
                .uri("/api/users/ping")
                .header("Authorization", "Bearer " + memberToken(userIdA, tenantIdA))
                .exchange()
                .expectStatus().isUnauthorized();

        // Org B token still passes
        webTestClient.get()
                .uri("/api/users/ping")
                .header("Authorization", "Bearer " + memberToken(userIdB, tenantIdB))
                .exchange()
                .expectStatus().isOk();
    }

    /**
     * If user-service is unreachable the gateway must fail closed with 503
     * MEMBER_ACCESS_UNAVAILABLE — it must never grant access on outage.
     */
    @Test
    void userServiceOutage_failsClosed() {
        String userId = UUID.randomUUID().toString();
        String tenantId = UUID.randomUUID().toString();
        // Simulate outage: member-link endpoint returns 503
        WIRE_MOCK.stubFor(get(urlPathEqualTo("/internal/users/member-link/check"))
                .willReturn(aResponse().withStatus(503)));
        stubDownstream();

        webTestClient.get()
                .uri("/api/users/ping")
                .header("Authorization", "Bearer " + memberToken(userId, tenantId))
                .exchange()
                .expectStatus().isEqualTo(503)
                .expectBody()
                .jsonPath("$.success").isEqualTo(false)
                .jsonPath("$.errorCode").isEqualTo("MEMBER_ACCESS_UNAVAILABLE");
    }

    /**
     * The gateway must strip any caller-supplied {@code X-Internal-Key} header and
     * inject its own {@code X-Internal-Auth} key. Downstream must never see the
     * attacker-controlled value.
     */
    @Test
    void internalKeyHeader_isInjectedAndCallerSuppliedKeyRemoved() {
        String userId = UUID.randomUUID().toString();
        String tenantId = UUID.randomUUID().toString();
        stubMemberLink(userId, tenantId, true);

        // Register a stub that ONLY matches if X-Internal-Key is absent and
        // X-Internal-Auth equals our server key. No fallback stub — if headers
        // are wrong, WireMock returns 404 and the test fails.
        WIRE_MOCK.stubFor(get(urlPathEqualTo("/api/users/ping"))
                .withHeader("X-Internal-Key", absent())
                .withHeader("X-Internal-Auth", equalTo(INTERNAL_KEY))
                .willReturn(aResponse()
                        .withStatus(200)
                        .withHeader("Content-Type", "application/json")
                        .withBody("{\"ok\":true}")));

        webTestClient.get()
                .uri("/api/users/ping")
                .header("Authorization", "Bearer " + memberToken(userId, tenantId))
                .header("X-Internal-Key", "attacker-supplied-key") // must be stripped
                .exchange()
                .expectStatus().isOk();
    }
}
