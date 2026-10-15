package com.chitfund.common.logging;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class MdcLoggingFilterTest {

    @Test
    void exposesPrivacySafeAuditContextAndNeverRawDeviceToken() throws Exception {
        MdcLoggingFilter filter = new MdcLoggingFilter();
        ReflectionTestUtils.setField(filter, "serviceName", "test-service");
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/payments");
        request.addHeader("X-Request-ID", "request-42");
        request.addHeader("X-Client-Source", "mobile");
        request.addHeader("Idempotency-Key", "payment-key-1");
        request.addHeader("X-Device-Token", "do-not-persist-this-token");
        request.setRemoteAddr("203.0.113.8");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<AuditRequestContext> observed = new AtomicReference<>();

        filter.doFilterInternal(request, response, (req, res) ->
                observed.set(AuditRequestContext.current()));

        assertThat(response.getHeader("X-Request-ID")).isEqualTo("request-42");
        assertThat(observed.get().correlationId()).isEqualTo("request-42");
        assertThat(observed.get().source()).isEqualTo("MOBILE");
        assertThat(observed.get().actorIp()).isEqualTo("203.0.113.8");
        assertThat(observed.get().idempotencyKey()).isEqualTo("payment-key-1");
        assertThat(observed.get().deviceSessionHash())
                .hasSize(64)
                .doesNotContain("do-not-persist-this-token");
    }

    @Test
    void rejectsMalformedContextInsteadOfCopyingItIntoLogsOrAudit() throws Exception {
        MdcLoggingFilter filter = new MdcLoggingFilter();
        ReflectionTestUtils.setField(filter, "serviceName", "test-service");
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/test");
        request.addHeader("X-Request-ID", "bad\nrequest");
        request.addHeader("X-Client-Source", "ROOT_CONSOLE");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<AuditRequestContext> observed = new AtomicReference<>();

        filter.doFilterInternal(request, response, (req, res) ->
                observed.set(AuditRequestContext.current()));

        assertThat(observed.get().correlationId()).isNotBlank().isNotEqualTo("bad\nrequest");
        assertThat(observed.get().source()).isEqualTo("UNKNOWN");
    }
}
