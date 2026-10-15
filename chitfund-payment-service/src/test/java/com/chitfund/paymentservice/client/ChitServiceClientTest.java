package com.chitfund.paymentservice.client;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class ChitServiceClientTest {
    private MockRestServiceServer server;
    private ChitServiceClient client;

    @BeforeEach
    void setUp() {
        RestTemplate restTemplate = new RestTemplate();
        server = MockRestServiceServer.createServer(restTemplate);
        client = new ChitServiceClient(restTemplate);
        ReflectionTestUtils.setField(client, "chitServiceUrl", "http://chit.test");
        ReflectionTestUtils.setField(client, "internalKey", "internal-secret");
        TenantContext.set("tenant-a");
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void drawDependencyCheckCarriesTenantAndMapsHistory() {
        UUID chitId = UUID.randomUUID();
        server.expect(requestTo("http://chit.test/internal/chits/" + chitId + "/draws/5/dependencies"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Key", "internal-secret"))
                .andExpect(header("X-Tenant-ID", "tenant-a"))
                .andRespond(withSuccess("""
                        {"data":{"winnerCount":1,"processedReservationCount":0,"auctionHistory":false}}
                        """, MediaType.APPLICATION_JSON));

        ChitServiceClient.DrawDependencyDto result = client.getDrawDependencies(chitId, 5);

        assertThat(result.getWinnerCount()).isEqualTo(1);
        assertThat(result.hasHistory()).isTrue();
        server.verify();
    }

    @Test
    void chitDependencyFailureBlocksPhysicalDrawDeletion() {
        UUID chitId = UUID.randomUUID();
        server.expect(requestTo("http://chit.test/internal/chits/" + chitId + "/draws/5/dependencies"))
                .andRespond(withServerError());

        assertThatThrownBy(() -> client.getDrawDependencies(chitId, 5))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getHttpStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        server.verify();
    }

    @Test
    void enrollmentFailureBlocksSettlementPreview() {
        UUID memberId = UUID.randomUUID();
        server.expect(requestTo("http://chit.test/internal/enrollments/member/" + memberId))
                .andExpect(header("X-Tenant-ID", "tenant-a"))
                .andRespond(withServerError());

        assertThatThrownBy(() -> client.getEnrollmentsForMember(memberId))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getHttpStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        server.verify();
    }

    @Test
    void malformedEnrollmentResponseDoesNotLookLikeNoChits() {
        UUID memberId = UUID.randomUUID();
        server.expect(requestTo("http://chit.test/internal/enrollments/member/" + memberId))
                .andRespond(withSuccess("{\"data\":{}}", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.getEnrollmentsForMember(memberId))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getHttpStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        server.verify();
    }

    @Test
    void reservationFailureBlocksSettlementCalculation() {
        UUID memberId = UUID.randomUUID();
        UUID chitId = UUID.randomUUID();
        server.expect(requestTo("http://chit.test/internal/reservations/chit/" + chitId
                        + "/member/" + memberId))
                .andExpect(header("X-Tenant-ID", "tenant-a"))
                .andRespond(withServerError());

        assertThatThrownBy(() -> client.getReservationsForMemberInChit(chitId, memberId))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getHttpStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        server.verify();
    }

    @Test
    void crossScopeReservationResponseIsRejected() {
        UUID memberId = UUID.randomUUID();
        UUID chitId = UUID.randomUUID();
        server.expect(requestTo("http://chit.test/internal/reservations/chit/" + chitId
                        + "/member/" + memberId))
                .andRespond(withSuccess("""
                        {"data":[{"id":"%s","chitId":"%s","memberId":"%s","status":"RESERVED"}]}
                        """.formatted(UUID.randomUUID(), chitId, UUID.randomUUID()),
                        MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.getReservationsForMemberInChit(chitId, memberId))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getHttpStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        server.verify();
    }
}
