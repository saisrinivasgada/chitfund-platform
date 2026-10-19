package com.chitfund.paymentservice.exception;

import org.junit.jupiter.api.Test;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.http.HttpStatus;
import static org.assertj.core.api.Assertions.assertThat;

class ConcurrencyResponseTest {
    @Test void temporaryDatabaseContentionRemainsRetryableForSavedOfflineMoney() {
        var response=new GlobalExceptionHandler().handleContention(new CannotAcquireLockException("deadlock victim"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(response.getHeaders().getFirst("Retry-After")).isEqualTo("1");
    }
}
