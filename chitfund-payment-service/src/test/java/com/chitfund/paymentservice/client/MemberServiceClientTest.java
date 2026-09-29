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

class MemberServiceClientTest {

    private MockRestServiceServer server;
    private MemberServiceClient client;

    @BeforeEach
    void setUp() {
        RestTemplate restTemplate = new RestTemplate();
        server = MockRestServiceServer.createServer(restTemplate);
        client = new MemberServiceClient(restTemplate);
        ReflectionTestUtils.setField(client, "memberServiceUrl", "http://member.test");
        ReflectionTestUtils.setField(client, "internalKey", "internal-secret");
        TenantContext.set("tenant-a");
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void activeValidationCarriesTenantScope() {
        UUID memberId = UUID.randomUUID();
        server.expect(requestTo("http://member.test/internal/members/" + memberId + "/validate"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Key", "internal-secret"))
                .andExpect(header("X-Tenant-ID", "tenant-a"))
                .andRespond(withSuccess("{\"active\":true}", MediaType.APPLICATION_JSON));

        assertThat(client.isMemberActive(memberId)).isTrue();
        server.verify();
    }

    @Test
    void validationDependencyFailureFailsClosed() {
        UUID memberId = UUID.randomUUID();
        server.expect(requestTo("http://member.test/internal/members/" + memberId + "/validate"))
                .andRespond(withServerError());

        assertThatThrownBy(() -> client.isMemberActive(memberId))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getHttpStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        server.verify();
    }

    @Test
    void missingTenantContextBlocksValidationWithoutNetworkCall() {
        TenantContext.clear();

        assertThatThrownBy(() -> client.isMemberActive(UUID.randomUUID()))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.getHttpStatus()).isEqualTo(HttpStatus.FORBIDDEN));
        server.verify();
    }

    @Test
    void durableStatusSyncUsesItsExplicitTenant() {
        UUID memberId = UUID.randomUUID();
        String tenantId = "tenant-from-durable-command";
        server.expect(requestTo("http://member.test/internal/members/" + memberId + "/deactivate"))
                .andExpect(method(HttpMethod.PATCH))
                .andExpect(header("X-Internal-Key", "internal-secret"))
                .andExpect(header("X-Tenant-ID", tenantId))
                .andRespond(withSuccess("{\"success\":true}", MediaType.APPLICATION_JSON));

        client.setMemberStatus(memberId, "INACTIVE", tenantId);

        server.verify();
    }
}
