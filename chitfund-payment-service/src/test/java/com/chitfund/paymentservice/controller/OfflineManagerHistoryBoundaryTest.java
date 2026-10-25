package com.chitfund.paymentservice.controller;

import com.chitfund.common.offline.OfflineDownloadAccess;
import com.chitfund.common.offline.OfflineSnapshotReader;
import com.chitfund.paymentservice.dto.response.PagedResponse;
import com.chitfund.paymentservice.service.PaymentService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.client.RestTemplate;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.*;

class OfflineManagerHistoryBoundaryTest {
    @Test void managerDownloadUsesTheSameInclusiveSevenCalendarDaysAsOnlineHistory() {
        LocalDate today=LocalDate.now();
        PaymentService payments=mock(PaymentService.class);
        try(var snapshots=mockConstruction(OfflineSnapshotReader.class,(mock,context)->
                when(mock.read(any(),any())).thenAnswer(inv->((Supplier<Map<String,Object>>)inv.getArgument(1)).get()));
            var access=mockConstruction(OfflineDownloadAccess.class)) {
            when(payments.getAllBatchesPaged(isNull(),isNull(),any(),any(),eq(0),eq(200)))
                    .thenReturn(PagedResponse.<com.chitfund.paymentservice.dto.response.PaymentBatchResponse>builder().content(List.of()).totalElements(0).build());
            var controller=new OfflineReadController(payments,null,mock(JdbcTemplate.class),mock(PlatformTransactionManager.class),mock(RestTemplate.class),"http://fixture","test-key");
            var auth=new UsernamePasswordAuthenticationToken(UUID.randomUUID(),null,List.of(new SimpleGrantedAuthority("ROLE_MANAGER")));
            controller.page(0,200,null,auth,"proof");
            var from=org.mockito.ArgumentCaptor.forClass(LocalDate.class);
            verify(payments).getAllBatchesPaged(isNull(),isNull(),from.capture(),eq(today),eq(0),eq(200));
            assertThat(from.getValue()).isEqualTo(today.minusDays(6));
            assertThat(today.minusDays(6).isBefore(from.getValue())).isFalse();
            assertThat(today.minusDays(7).isBefore(from.getValue())).isTrue();
            verify(access.constructed().get(0)).authorize(auth.getPrincipal().toString(),"MANAGER","proof");
        }
    }
}
