package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.userservice.domain.entity.IdentityOperationExecution;
import com.chitfund.userservice.dto.request.PhoneReassignmentExecutionRequest;
import com.chitfund.userservice.repository.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class IdentityReassignmentServiceTest {
    @Mock IdentityOperationExecutionRepository executionRepository;
    @Mock RetiredPhoneIdentityRepository retiredPhoneRepository;
    @Mock UserRepository userRepository;
    @Mock RefreshTokenRepository refreshTokenRepository;
    @Mock TrustedDeviceRepository trustedDeviceRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock ChitfundRequestService chitfundRequestService;
    @Mock com.chitfund.userservice.client.MemberServiceClient memberServiceClient;
    @Mock MemberUserLinkRepository memberUserLinkRepository;
    @Mock org.springframework.context.ApplicationEventPublisher eventPublisher;
    IdentityReassignmentService service;

    @BeforeEach
    void setUp() {
        service = new IdentityReassignmentService(executionRepository, retiredPhoneRepository,
                userRepository, refreshTokenRepository, trustedDeviceRepository, passwordEncoder,
                chitfundRequestService, new ObjectMapper(), memberServiceClient,
                memberUserLinkRepository, eventPublisher);
    }

    @Test
    void completedOperationReturnsStoredResultWithoutRepeatingSideEffects() {
        PhoneReassignmentExecutionRequest request = request();
        String expectedHash = AuthService.sha256Value(
                request.getOldUserId() + "|+91|9876543210|new.person@example.com|");
        IdentityOperationExecution execution = IdentityOperationExecution.builder()
                .operationId("operation-1").requestHash(expectedHash).status("COMPLETED")
                .resultJson("{\"newUserId\":\"new-user\",\"requestIds\":[\"request-1\"],\"status\":\"COMPLETED\"}")
                .build();
        when(executionRepository.findByIdForUpdate("operation-1")).thenReturn(Optional.of(execution));

        var result = service.execute(request);

        assertThat(result.get("newUserId")).isEqualTo("new-user");
        verify(executionRepository).insertIfAbsent("operation-1", expectedHash);
        verifyNoInteractions(retiredPhoneRepository, userRepository, refreshTokenRepository,
                trustedDeviceRepository, passwordEncoder, chitfundRequestService);
    }

    @Test
    void reusedIdempotencyKeyWithDifferentRequestIsRejected() {
        PhoneReassignmentExecutionRequest request = request();
        IdentityOperationExecution execution = IdentityOperationExecution.builder()
                .operationId("operation-1").requestHash("a-different-request-hash").status("PENDING").build();
        when(executionRepository.findByIdForUpdate("operation-1")).thenReturn(Optional.of(execution));

        assertThatThrownBy(() -> service.execute(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("idempotency key");
        verifyNoInteractions(retiredPhoneRepository, userRepository, refreshTokenRepository,
                trustedDeviceRepository, passwordEncoder, chitfundRequestService);
    }

    private static PhoneReassignmentExecutionRequest request() {
        PhoneReassignmentExecutionRequest request = new PhoneReassignmentExecutionRequest();
        request.setOperationId("operation-1");
        request.setOldUserId(UUID.fromString("11111111-1111-1111-1111-111111111111"));
        request.setPhoneCountryCode("+91");
        request.setPhone("9876543210");
        request.setEmail("new.person@example.com");
        request.setApprovedMemberLinks(List.of());
        return request;
    }
}
