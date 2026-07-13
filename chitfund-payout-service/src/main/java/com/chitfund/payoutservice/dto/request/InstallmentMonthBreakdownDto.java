package com.chitfund.payoutservice.dto.request;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class InstallmentMonthBreakdownDto {
    private Integer month;
    private BigDecimal amount;
}
