package com.chitfund.chitservice.service;

import com.chitfund.chitservice.client.AuditClient;
import com.chitfund.chitservice.mapper.ChitMapper;
import com.chitfund.chitservice.repository.ChitEnrollmentRepository;
import com.chitfund.common.exception.ResourceNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EnrollmentTenantIsolationTest {

    @Mock ChitService chitService;
    @Mock ChitEnrollmentRepository enrollmentRepository;
    @Mock ChitMapper chitMapper;
    @Mock PlanLimitChecker planLimitChecker;
    @Mock AuditClient auditClient;

    @InjectMocks EnrollmentService enrollmentService;

    @Test
    void enrollmentListCannotReadAChitFromAnotherTenant() {
        UUID chitId = UUID.randomUUID();
        when(chitService.findByIdScoped(chitId))
                .thenThrow(new ResourceNotFoundException("Chit", chitId));

        assertThrows(ResourceNotFoundException.class, () -> enrollmentService.listEnrollments(chitId));

        verifyNoInteractions(enrollmentRepository);
        verify(chitService, never()).findById(chitId);
    }
}
