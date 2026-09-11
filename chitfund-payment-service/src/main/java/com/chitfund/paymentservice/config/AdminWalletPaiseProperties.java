package com.chitfund.paymentservice.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "chitwise.money.admin-wallet")
@Data
public class AdminWalletPaiseProperties {
    private boolean reconciliationEnabled = true;
    private boolean requireComplete = false;
}
