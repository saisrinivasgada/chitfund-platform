package com.chitfund.paymentservice.controller;

import com.chitfund.common.context.MemberContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.paymentservice.client.ChitServiceClient;
import com.chitfund.paymentservice.dto.response.DrawSummaryResponse;
import com.chitfund.paymentservice.service.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MemberOfflineReadAuthorizationTest {
    @Mock ChitServiceClient chits;
    @Mock ChitMonthDrawService draws;
    @Mock PaymentService payments;
    @AfterEach void clear() { MemberContext.clear(); }
    @Test void aMissingMemberContextNeverDownloadsAnOrganisationsDraws() {
        assertThatThrownBy(() -> new MemberDrawController(chits, draws).getDraws(UUID.randomUUID()))
                .isInstanceOf(BusinessException.class);
        verifyNoInteractions(chits, draws);
    }
    @Test void aMemberCannotDownloadAnotherChitsSchedule() {
        UUID member = UUID.randomUUID(); MemberContext.set(member.toString());
        when(chits.getEnrollmentsForMember(member)).thenReturn(List.of());
        assertThatThrownBy(() -> new MemberDrawController(chits, draws).getDraws(UUID.randomUUID()))
                .isInstanceOf(BusinessException.class);
        verifyNoInteractions(draws);
    }
    @Test void anEnrolledMemberSeesTheScheduleWithoutPrivateCollectionOrAdminFields() throws Exception {
        UUID member = UUID.randomUUID(); UUID chit = UUID.randomUUID(); MemberContext.set(member.toString());
        var enrollment = new ChitServiceClient.EnrollmentDto(); enrollment.setChitId(chit);
        when(chits.getEnrollmentsForMember(member)).thenReturn(List.of(enrollment));
        when(draws.getCyclesForChit(chit)).thenReturn(List.of(DrawSummaryResponse.builder()
                .id(UUID.randomUUID()).chitId(chit).monthNumber(1).openedBy(UUID.randomUUID())
                .totalCollected(new java.math.BigDecimal("50000")).build()));
        var response = new MemberDrawController(chits, draws).getDraws(chit).getBody().getData().get(0);
        var json = new ObjectMapper().findAndRegisterModules().readTree(new ObjectMapper().findAndRegisterModules().writeValueAsString(response));
        assertThat(json.get("chitId").asText()).isEqualTo(chit.toString());
        assertThat(json.has("openedBy")).isFalse(); assertThat(json.has("totalCollected")).isFalse();
    }
    @Test void paymentHistoryRejectsAnotherMemberBeforeReadingAnyPayments() {
        MemberContext.set(UUID.randomUUID().toString());
        var auth = new UsernamePasswordAuthenticationToken(UUID.randomUUID(), null, List.of(new SimpleGrantedAuthority("ROLE_MEMBER")));
        assertThatThrownBy(() -> new PaymentController(payments, null, null).getPaymentHistory(UUID.randomUUID(), UUID.randomUUID(), auth))
                .isInstanceOf(BusinessException.class);
        verifyNoInteractions(payments);
    }
}
