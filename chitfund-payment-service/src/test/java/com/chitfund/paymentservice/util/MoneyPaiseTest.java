package com.chitfund.paymentservice.util;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MoneyPaiseTest {

    @Test
    void convertsDecimalMoneyExactly() {
        assertThat(MoneyPaise.exact(new BigDecimal("1234.56"))).isEqualTo(123456L);
        assertThat(MoneyPaise.exact(new BigDecimal("0.10"))).isEqualTo(10L);
    }

    @Test
    void refusesFractionalPaiseInsteadOfRounding() {
        assertThatThrownBy(() -> MoneyPaise.exact(new BigDecimal("1.001")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("two decimal places");
    }

    @Test
    void refusesSignedLongOverflow() {
        assertThatThrownBy(() -> MoneyPaise.exact(new BigDecimal("92233720368547758.08")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("64-bit");
    }
}
