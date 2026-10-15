package com.chitfund.paymentservice.controller;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.paymentservice.client.MemberServiceClient;
import com.chitfund.paymentservice.dto.response.IntimationResponse;
import com.chitfund.paymentservice.service.PaymentIntimationService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaymentIntimationControllerAuthorizationTest {

    @Mock PaymentIntimationService intimationService;
    @Mock MemberServiceClient memberServiceClient;

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void memberDetailReadIsRestrictedToTheirResolvedProfile() {
        TenantContext.set("tenant-a");
        UUID userId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        when(memberServiceClient.getProfileIdByUserId(userId, "tenant-a")).thenReturn(memberId);
        when(intimationService.getOwnedById("intimation-1", memberId))
                .thenReturn(IntimationResponse.builder().id("intimation-1").build());

        controller().getById("intimation-1", memberAuth(userId));

        verify(intimationService).getOwnedById("intimation-1", memberId);
        verify(intimationService, never()).getById("intimation-1");
    }

    @Test
    void memberWithoutTenantProfileCannotCreateOrReadIntimationsAsAnOrphanIdentity() {
        TenantContext.set("tenant-a");
        UUID userId = UUID.randomUUID();
        when(memberServiceClient.getProfileIdByUserId(userId, "tenant-a")).thenReturn(null);

        assertThatThrownBy(() -> controller().getById("intimation-1", memberAuth(userId)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("No member profile");

        verify(intimationService, never()).getById("intimation-1");
        verify(intimationService, never()).getOwnedById(org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any());
    }

    private PaymentIntimationController controller() {
        return new PaymentIntimationController(intimationService, memberServiceClient);
    }

    private UsernamePasswordAuthenticationToken memberAuth(UUID userId) {
        return new UsernamePasswordAuthenticationToken(
                userId, null, List.of(new SimpleGrantedAuthority("ROLE_MEMBER")));
    }
}
