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

class PayoutServiceClientTest {

    private RestTemplate restTemplate;
    private MockRestServiceServer server;
    private PayoutServiceClient client;

    @BeforeEach
    void setUp() {
        restTemplate = new RestTemplate();
        server = MockRestServiceServer.createServer(restTemplate);
        client = new PayoutServiceClient(restTemplate);
        ReflectionTestUtils.setField(client, "payoutServiceUrl", "http://payout.test");
        ReflectionTestUtils.setField(client, "internalKey", "internal-secret");
        TenantContext.set("tenant-a");
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void sendsTenantScopeAndReturnsMatchingPayout() {
        UUID memberId = UUID.randomUUID();
        UUID chitId = UUID.randomUUID();
        UUID payoutId = UUID.randomUUID();
        server.expect(requestTo("http://payout.test/internal/payouts/member/" + memberId + "/chit/" + chitId))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Key", "internal-secret"))
                .andExpect(header("X-Tenant-ID", "tenant-a"))
                .andRespond(withSuccess("""
                        {"data":{"id":"%s","memberId":"%s","chitId":"%s","monthNumber":2,
                        "netPayoutAmount":5000,"disbursedAmount":0,"status":"PENDING"}}
                        """.formatted(payoutId, memberId, chitId), MediaType.APPLICATION_JSON));

        PayoutServiceClient.PayoutDto result = client.getPayoutForMemberInChit(memberId, chitId);

        assertThat(result.getId()).isEqualTo(payoutId);
        assertThat(result.getStatus()).isEqualTo("PENDING");
        server.verify();
    }

    @Test
    void returnsNullOnlyForExplicitNoPayoutResponse() {
        UUID memberId = UUID.randomUUID();
        UUID chitId = UUID.randomUUID();
        server.expect(requestTo("http://payout.test/internal/payouts/member/" + memberId + "/chit/" + chitId))
                .andRespond(withSuccess("{\"data\":null}", MediaType.APPLICATION_JSON));

        assertThat(client.getPayoutForMemberInChit(memberId, chitId)).isNull();
        server.verify();
    }

    @Test
    void dependencyFailureBlocksSettlementCalculation() {
        UUID memberId = UUID.randomUUID();
        UUID chitId = UUID.randomUUID();
        server.expect(requestTo("http://payout.test/internal/payouts/member/" + memberId + "/chit/" + chitId))
                .andRespond(withServerError());

        assertThatThrownBy(() -> client.getPayoutForMemberInChit(memberId, chitId))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getHttpStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        server.verify();
    }

    @Test
    void mismatchedResponseIsRejectedInsteadOfCrossingScope() {
        UUID memberId = UUID.randomUUID();
        UUID chitId = UUID.randomUUID();
        server.expect(requestTo("http://payout.test/internal/payouts/member/" + memberId + "/chit/" + chitId))
                .andRespond(withSuccess("""
                        {"data":{"id":"%s","memberId":"%s","chitId":"%s","status":"PENDING"}}
                        """.formatted(UUID.randomUUID(), UUID.randomUUID(), chitId), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.getPayoutForMemberInChit(memberId, chitId))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getHttpStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        server.verify();
    }
}
