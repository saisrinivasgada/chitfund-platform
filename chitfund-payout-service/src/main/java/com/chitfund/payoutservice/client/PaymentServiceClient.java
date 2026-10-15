package com.chitfund.payoutservice.client;

import com.chitfund.common.dto.PayoutFinancialCommandRequest;
import com.chitfund.payoutservice.domain.PayoutFinancialCommand;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

@Component
@RequiredArgsConstructor
public class PaymentServiceClient {

    private final RestTemplate restTemplate;

    @Value("${app.payment-service-url:http://localhost:8084}")
    private String paymentServiceUrl;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    /** Execute one leased, durable command. Any non-2xx response is propagated
     * so the command worker records a retry rather than losing the operation. */
    public void execute(PayoutFinancialCommand command) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Internal-Key", internalKey);
        headers.set("X-Tenant-ID", command.getTenantId());
        headers.set("Content-Type", "application/json");
        PayoutFinancialCommandRequest request = new PayoutFinancialCommandRequest(
                command.getId(), command.getCommandType().name(), command.getTenantId(),
                command.getActorId(),
                command.getPayoutId(), command.getChitId(), command.getMemberId(),
                command.getMonthNumber(), command.getAmount(),
                command.getDisbursementMode() != null
                        ? command.getDisbursementMode().name() : null);
        restTemplate.postForEntity(
                paymentServiceUrl + "/payments/internal/payout-financial-command",
                new HttpEntity<>(request, headers), Void.class);
    }

}
