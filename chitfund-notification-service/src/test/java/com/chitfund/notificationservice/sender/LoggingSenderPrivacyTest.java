package com.chitfund.notificationservice.sender;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LoggingSenderPrivacyTest {

    @Test
    void masksPhoneAndEmailDestinations() {
        assertThat(LoggingNotificationSender.maskDestination("+919876543210"))
                .isEqualTo("***3210");
        assertThat(LoggingNotificationSender.maskDestination("member@example.com"))
                .isEqualTo("m***@example.com");
        assertThat(LoggingEmailSender.maskEmail("member@example.com"))
                .isEqualTo("m***@example.com");
    }
}
