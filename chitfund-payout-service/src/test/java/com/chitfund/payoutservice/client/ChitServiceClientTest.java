package com.chitfund.payoutservice.client;

import com.chitfund.common.exception.BusinessException;
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
    }

    @Test
    void winnerValidationCarriesTenantAndRejectsClientAuthority() {
        UUID chitId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        UUID winnerId = UUID.randomUUID();
        server.expect(requestTo("http://chit.test/internal/chits/" + chitId
                        + "/draws/2/winners/" + memberId))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Key", "internal-secret"))
                .andExpect(header("X-Tenant-ID", "tenant-a"))
                .andRespond(withSuccess("""
                        {"data":{"winnerCount":1,"id":"%s","chitId":"%s","memberId":"%s",
                        "monthNumber":2,"winningAmount":45000.00,"auctionDiscountAmount":5000.00}}
                        """.formatted(winnerId, chitId, memberId), MediaType.APPLICATION_JSON));

        ChitServiceClient.WinnerDto result = client
                .getWinnerForPayout(chitId, 2, memberId, "tenant-a");

        assertThat(result.getWinnerCount()).isEqualTo(1);
        assertThat(result.getWinningAmount()).isEqualByComparingTo("45000.00");
        assertThat(result.getAuctionDiscountAmount()).isEqualByComparingTo("5000.00");
        server.verify();
    }

    @Test
    void mismatchedWinnerResponseFailsClosed() {
        UUID chitId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        server.expect(requestTo("http://chit.test/internal/chits/" + chitId
                        + "/draws/2/winners/" + memberId))
                .andRespond(withSuccess("""
                        {"data":{"winnerCount":1,"id":"%s","chitId":"%s","memberId":"%s",
                        "monthNumber":2,"winningAmount":45000.00}}
                        """.formatted(UUID.randomUUID(), chitId, UUID.randomUUID()), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.getWinnerForPayout(chitId, 2, memberId, "tenant-a"))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getHttpStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        server.verify();
    }

    @Test
    void dependencyFailureBlocksPayoutCreation() {
        UUID chitId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        server.expect(requestTo("http://chit.test/internal/chits/" + chitId
                        + "/draws/2/winners/" + memberId))
                .andRespond(withServerError());

        assertThatThrownBy(() -> client.getWinnerForPayout(chitId, 2, memberId, "tenant-a"))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getHttpStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        server.verify();
    }
    @Test
    void unresolvedScheduleBlocksPayoutWhileVerifiedClearScheduleAllowsIt() {
        UUID chit = UUID.randomUUID();
        server.expect(requestTo("http://chit.test/internal/chits/" + chit)).andExpect(header("X-Tenant-ID", "tenant-a"))
                .andRespond(withSuccess("{\"data\":{\"id\":\"" + chit + "\",\"scheduleSyncCommandId\":\"pending\"}}", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> client.assertScheduleReady(chit, "tenant-a")).isInstanceOf(BusinessException.class).hasMessageContaining("still syncing");
        server.verify(); server.reset();
        server.expect(requestTo("http://chit.test/internal/chits/" + chit)).andRespond(withSuccess("{\"data\":{\"id\":\"" + chit + "\"}}", MediaType.APPLICATION_JSON));
        client.assertScheduleReady(chit, "tenant-a"); server.verify();
    }
    @Test
    void unavailableScheduleCannotAuthorizeANewDisbursement() {
        UUID chit = UUID.randomUUID();
        server.expect(requestTo("http://chit.test/internal/chits/" + chit)).andRespond(withServerError());
        assertThatThrownBy(() -> client.assertScheduleReady(chit, "tenant-a")).isInstanceOf(BusinessException.class).hasMessageContaining("could not be verified");
        server.verify();
    }

}
