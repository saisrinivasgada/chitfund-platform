package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class WhatsAppSmsServiceTest {

    private static final String TOKEN = "test-access-token-with-safe-length";

    @Test
    void sendsAuthenticationTemplateToNormalizedIndianNumber() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        var service = service(restTemplate);
        server.expect(requestTo("https://graph.example/v23.0/123456789/messages"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer " + TOKEN))
                .andExpect(content().string(containsString("\"to\":\"919876543210\"")))
                .andExpect(content().string(containsString("\"text\":\"123456\"")))
                .andRespond(withSuccess("{}", org.springframework.http.MediaType.APPLICATION_JSON));

        service.sendOtp("98765 43210", "+91", "123456");

        server.verify();
    }

    @Test
    void doesNotDuplicateCountryCodeForAnE164Number() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        var service = service(restTemplate);
        server.expect(requestTo("https://graph.example/v23.0/123456789/messages"))
                .andExpect(content().string(containsString("\"to\":\"919876543210\"")))
                .andRespond(withSuccess("{}", org.springframework.http.MediaType.APPLICATION_JSON));

        service.sendOtp("+91 98765 43210", "+91", "123456");

        server.verify();
    }

    @Test
    void mapsProviderBodyToPrivacySafeDeliveryFailure() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        var service = service(restTemplate);
        server.expect(requestTo("https://graph.example/v23.0/123456789/messages"))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST)
                        .body("{\"error\":{\"message\":\"provider-sensitive-detail\"}}"));

        assertThatThrownBy(() -> service.sendOtp("9876543210", "+91", "123456"))
                .isInstanceOfSatisfying(BusinessException.class, exception -> {
                    assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.OTP_DELIVERY_FAILED);
                    assertThat(exception.getMessage()).doesNotContain("provider-sensitive-detail");
                });
    }

    @Test
    void refusesToStartEnabledDeliveryWithPlaceholderConfiguration() {
        assertThatThrownBy(() -> new WhatsAppSmsService(
                new RestTemplate(), "https://graph.example", "NOT_CONFIGURED",
                "NOT_CONFIGURED", "NOT_CONFIGURED", "otp_verification", "en_US"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("WHATSAPP_API_VERSION");
    }

    @Test
    void refusesPlaintextProviderEndpointThatWouldExposeTokenAndOtp() {
        assertThatThrownBy(() -> new WhatsAppSmsService(
                new RestTemplate(), "http://graph.example", "v23.0",
                "123456789", TOKEN, "otp_verification", "en_US"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("HTTPS");
    }

    private WhatsAppSmsService service(RestTemplate restTemplate) {
        return new WhatsAppSmsService(restTemplate, "https://graph.example/", "v23.0",
                "123456789", TOKEN, "otp_verification", "en_US");
    }
}
