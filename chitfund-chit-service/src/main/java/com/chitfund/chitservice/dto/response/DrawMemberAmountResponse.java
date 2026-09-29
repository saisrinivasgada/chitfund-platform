package com.chitfund.chitservice.dto.response;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/** Canonical amount due for one member when the next draw is opened. */
@Data
@AllArgsConstructor
public class DrawMemberAmountResponse {
    private UUID memberId;
    private BigDecimal amountDue;
}
