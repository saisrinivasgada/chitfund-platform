package com.chitfund.paymentservice.util;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class MoneyPaise {

    private MoneyPaise() {}

    public static long exact(BigDecimal amount) {
        if (amount == null) throw new IllegalArgumentException("Money amount is required");
        try {
            return amount.setScale(2, RoundingMode.UNNECESSARY)
                    .movePointRight(2)
                    .longValueExact();
        } catch (ArithmeticException exception) {
            throw new IllegalArgumentException(
                    "Money amount must have at most two decimal places and fit in signed 64-bit paise",
                    exception);
        }
    }
}
