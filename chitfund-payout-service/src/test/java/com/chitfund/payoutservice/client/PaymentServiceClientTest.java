package com.chitfund.payoutservice.client;

import com.chitfund.payoutservice.domain.PayoutFinancialCommand;
import com.chitfund.payoutservice.domain.enums.DisbursementMode;
import com.chitfund.payoutservice.domain.enums.PayoutFinancialCommandType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.UUID;

import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withNoContent;

class PaymentServiceClientTest {

    private MockRestServiceServer server;
    private PaymentServiceClient client;

    @BeforeEach
    void setUp() {
        RestTemplate restTemplate = new RestTemplate();
        server = MockRestServiceServer.createServer(restTemplate);
        client = new PaymentServiceClient(restTemplate);
        ReflectionTestUtils.setField(client, "paymentServiceUrl", "http://payment.test");
        ReflectionTestUtils.setField(client, "internalKey", "internal-secret");
    }

    @Test
    void durableFinancialCommandCarriesIndependentTenantScope() {
        PayoutFinancialCommand command = PayoutFinancialCommand.builder()
                .id(UUID.randomUUID())
                .tenantId("tenant-a")
                .commandType(PayoutFinancialCommandType.RECORD_TREASURY_DEBIT)
                .status("PENDING")
                .actorId(UUID.randomUUID())
                .payoutId(UUID.randomUUID())
                .memberId(UUID.randomUUID())
                .amount(BigDecimal.valueOf(500))
                .disbursementMode(DisbursementMode.UPI)
                .build();
        server.expect(requestTo("http://payment.test/payments/internal/payout-financial-command"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Internal-Key", "internal-secret"))
                .andExpect(header("X-Tenant-ID", "tenant-a"))
                .andRespond(withNoContent());

        client.execute(command);

        server.verify();
    }
}
