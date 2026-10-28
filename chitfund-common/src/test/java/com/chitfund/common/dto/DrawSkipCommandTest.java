package com.chitfund.common.dto;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;
class DrawSkipCommandTest {
    @Test void retriesNormalizeAmountAndMembershipOrderButNeverInterchangeShiftWithSkip() {
        UUID a=UUID.randomUUID(), b=UUID.randomUUID(), chit=UUID.randomUUID(), actor=UUID.randomUUID(), command=UUID.randomUUID();
        var request=new DrawSkipRequest(); request.setAttemptId(UUID.randomUUID()); request.setChitId(chit); request.setMonthNumber(1);
        request.setDueDate(LocalDate.of(2026,10,1)); request.setInstallmentAmount(new BigDecimal("1000.00")); request.setMemberIds(List.of(a,b)); request.setSkipReason("Holiday pause");
        var envelope=new DrawSkipCommand(command,actor,"ADMIN",request); String hash=envelope.fingerprint();
        request.setInstallmentAmount(new BigDecimal("1000")); request.setMemberIds(List.of(b,a));
        assertThat(envelope.fingerprint()).isEqualTo(hash);
        assertThat(new DrawSkipCommand(command,actor,"ADMIN",request,true).fingerprint()).isNotEqualTo(hash);
        request.setSkipReason("Different reason"); assertThat(envelope.fingerprint()).isNotEqualTo(hash);
    }
}
