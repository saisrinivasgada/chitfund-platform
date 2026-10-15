package com.chitfund.notificationservice.client;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
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
    }

    @Test
    void memberResolutionCarriesTenantScope() {
        server.expect(requestTo("http://member.test/internal/members/batch-user-ids"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Key", "internal-secret"))
                .andExpect(header("X-Tenant-ID", "tenant-a"))
                .andExpect(content().json("[\"member-a\"]"))
                .andRespond(withSuccess("{\"member-a\":\"user-a\"}", MediaType.APPLICATION_JSON));

        assertThat(client.batchGetUserIds("tenant-a", List.of("member-a")))
                .containsEntry("member-a", "user-a");
        server.verify();
    }

    @Test
    void missingTenantCannotResolveMemberIdentity() {
        assertThatThrownBy(() -> client.batchGetUserIds("", List.of("member-a")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("tenantId");
        server.verify();
    }
}
