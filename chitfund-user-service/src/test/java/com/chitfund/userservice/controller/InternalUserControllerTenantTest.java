package com.chitfund.userservice.controller;

import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.repository.MemberUserLinkRepository;
import com.chitfund.userservice.repository.UserRepository;
import com.chitfund.userservice.service.AuthService;
import com.chitfund.userservice.service.ChitfundRequestService;
import com.chitfund.userservice.service.AppAccessGrantService;
import com.chitfund.userservice.service.IdentityReassignmentService;
import com.chitfund.userservice.service.TenantService;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class InternalUserControllerTenantTest {

    @Test
    void roleFanoutReturnsOnlyUsersInRequestedTenant() {
        UserRepository users = mock(UserRepository.class);
        InternalUserController controller = new InternalUserController(
                users, mock(MemberUserLinkRepository.class), mock(TenantService.class), mock(AuthService.class),
                mock(PasswordEncoder.class), mock(ChitfundRequestService.class),
                mock(IdentityReassignmentService.class), mock(AppAccessGrantService.class));
        ReflectionTestUtils.setField(controller, "internalKey", "secret");
        UUID adminId = UUID.randomUUID();
        when(users.findByTenantIdAndRoleInAndDeletedAtIsNull("tenant-a", List.of(Role.ADMIN)))
                .thenReturn(List.of(User.builder().id(adminId).tenantId("tenant-a").role(Role.ADMIN).build()));

        var response = controller.getUserIdsByRole("ADMIN", "tenant-a", "secret");

        assertThat(response.getBody()).containsExactly(adminId.toString());
        verify(users).findByTenantIdAndRoleInAndDeletedAtIsNull("tenant-a", List.of(Role.ADMIN));
    }

    @Test
    void roleFanoutRejectsMissingTenant() {
        InternalUserController controller = new InternalUserController(
                mock(UserRepository.class), mock(MemberUserLinkRepository.class), mock(TenantService.class), mock(AuthService.class),
                mock(PasswordEncoder.class), mock(ChitfundRequestService.class),
                mock(IdentityReassignmentService.class), mock(AppAccessGrantService.class));
        ReflectionTestUtils.setField(controller, "internalKey", "secret");

        assertThat(controller.getUserIdsByRole("ADMIN", "", "secret").getStatusCode().value())
                .isEqualTo(403);
    }
}
