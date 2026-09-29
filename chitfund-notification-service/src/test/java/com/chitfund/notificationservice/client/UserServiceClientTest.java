package com.chitfund.notificationservice.client;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class UserServiceClientTest {

    private MockRestServiceServer server;
    private UserServiceClient client;

    @BeforeEach
    void setUp() {
        RestTemplate restTemplate = new RestTemplate();
        server = MockRestServiceServer.createServer(restTemplate);
        client = new UserServiceClient(restTemplate);
        ReflectionTestUtils.setField(client, "userServiceUrl", "http://user.test");
        ReflectionTestUtils.setField(client, "internalKey", "internal-secret");
    }

    @Test
    void roleLookupCarriesTenantScope() {
        server.expect(requestTo("http://user.test/internal/users/ids-by-role?role=ADMIN"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("X-Internal-Key", "internal-secret"))
                .andExpect(header("X-Tenant-ID", "tenant-a"))
                .andRespond(withSuccess("[\"admin-a\"]", MediaType.APPLICATION_JSON));

        assertThat(client.getUserIdsByRole("tenant-a", "ADMIN")).containsExactly("admin-a");
        server.verify();
    }

    @Test
    void roleLookupFailsClosedWithoutTenant() {
        assertThatThrownBy(() -> client.getUserIdsByRole("", "ADMIN"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("tenantId");
        server.verify();
    }
}
