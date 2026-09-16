package com.chitfund.supportservice.service;

import com.chitfund.supportservice.client.IdentityExecutionClient;
import com.chitfund.supportservice.domain.entity.Employee;
import com.chitfund.supportservice.domain.entity.IdentityCase;
import com.chitfund.supportservice.domain.enums.AccountCaseSubtype;
import com.chitfund.supportservice.domain.enums.IdentityCaseStatus;
import com.chitfund.supportservice.dto.request.IdentityCaseDecisionRequest;
import com.chitfund.supportservice.dto.request.PrepareIdentityCaseRequest;
import com.chitfund.supportservice.repository.EmployeeRepository;
import com.chitfund.supportservice.repository.IdentityCaseAuditRepository;
import com.chitfund.supportservice.repository.IdentityCaseRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.PlatformTransactionManager;

import java.util.Optional;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class IdentityCaseServiceTest {
    @Mock IdentityCaseRepository repository;
    @Mock IdentityCaseAuditRepository auditRepository;
    @Mock EmployeeRepository employeeRepository;
    @Mock IdentityExecutionClient executionClient;
    @Mock PlatformTransactionManager transactionManager;
    IdentityCaseService service;

    @BeforeEach
    void setUp() {
        service = new IdentityCaseService(repository, auditRepository, employeeRepository,
                new ObjectMapper(), executionClient, transactionManager);
        lenient().when(auditRepository.save(any())).thenAnswer(call -> call.getArgument(0));
        lenient().when(repository.save(any())).thenAnswer(call -> call.getArgument(0));
    }

    @Test
    void ordinaryEmployeeCannotReadOrPrepareIdentityCases() {
        when(employeeRepository.findById("employee")).thenReturn(Optional.of(employee("employee", false, false)));
        PrepareIdentityCaseRequest request = proposal();

        assertThatThrownBy(() -> service.getByTicket("employee", "ticket"))
                .isInstanceOf(SecurityException.class);
        assertThatThrownBy(() -> service.prepare("employee", "case", request))
                .isInstanceOf(SecurityException.class);
        verify(repository, never()).findByIdForUpdate(any());
    }

    @Test
    void selectedInvestigatorCanPrepareButCannotApprove() {
        IdentityCase identityCase = openCase();
        when(employeeRepository.findById("investigator"))
                .thenReturn(Optional.of(employee("investigator", true, false)));
        when(repository.findByIdForUpdate("case")).thenReturn(Optional.of(identityCase));

        var prepared = service.prepare("investigator", "case", proposal());

        assertThat(prepared.getStatus()).isEqualTo(IdentityCaseStatus.PROPOSED);
        assertThat(identityCase.getProposedBy()).isEqualTo("investigator");
        assertThatThrownBy(() -> service.approve("investigator", "case", decision()))
                .isInstanceOf(SecurityException.class);
    }

    @Test
    void protectedOwnerCannotApproveOwnProposalButCanApproveIndependentProposal() {
        IdentityCase identityCase = openCase();
        identityCase.setStatus(IdentityCaseStatus.PROPOSED);
        identityCase.setProposedBy("owner");
        when(employeeRepository.findById("owner")).thenReturn(Optional.of(employee("owner", true, true)));
        when(repository.findByIdForUpdate("case")).thenReturn(Optional.of(identityCase));

        assertThatThrownBy(() -> service.approve("owner", "case", decision()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("cannot approve");

        identityCase.setProposedBy("investigator");
        var approved = service.approve("owner", "case", decision());
        assertThat(approved.getStatus()).isEqualTo(IdentityCaseStatus.APPROVED);
        assertThat(identityCase.getExecutionKey()).isEqualTo("identity-case:case");
    }

    @Test
    void repeatingTheSameOwnerApprovalReturnsTheOriginalDecision() {
        IdentityCase identityCase = openCase();
        identityCase.setStatus(IdentityCaseStatus.APPROVED);
        identityCase.setProposedBy("investigator");
        identityCase.setDecidedBy("owner");
        identityCase.setDecisionReason("Independent owner review completed");
        identityCase.setExecutionKey("identity-case:case");
        when(employeeRepository.findById("owner")).thenReturn(Optional.of(employee("owner", true, true)));
        when(repository.findByIdForUpdate("case")).thenReturn(Optional.of(identityCase));

        var repeated = service.approve("owner", "case", decision());

        assertThat(repeated.getStatus()).isEqualTo(IdentityCaseStatus.APPROVED);
        verify(repository, never()).save(any());
        verify(auditRepository, never()).save(any());
    }

    private static Employee employee(String id, boolean investigator, boolean owner) {
        return Employee.builder().id(id).email(id + "@example.com").username(id).fullName(id)
                .role(owner ? "SUPER_ADMIN" : "SUPPORT_AGENT").active(true)
                .canManageIdentityCases(investigator).platformOwner(owner).build();
    }

    private static IdentityCase openCase() {
        return IdentityCase.builder().id("case").ticketId("ticket")
                .subtype(AccountCaseSubtype.PHONE_REASSIGNMENT).status(IdentityCaseStatus.OPEN).build();
    }

    private static PrepareIdentityCaseRequest proposal() {
        PrepareIdentityCaseRequest request = new PrepareIdentityCaseRequest();
        request.setReason("Verified government ID and carrier reassignment evidence");
        request.setOldUserId("11111111-1111-1111-1111-111111111111");
        request.setPhoneCountryCode("+91");
        request.setPhone("9876543210");
        request.setEmail("new.person@example.com");
        PrepareIdentityCaseRequest.MemberLink link = new PrepareIdentityCaseRequest.MemberLink();
        link.setTenantId("10000000-0000-0000-0000-000000000001");
        link.setMemberId("20000000-0000-0000-0000-000000000001");
        request.setApprovedMemberLinks(List.of(link));
        return request;
    }

    private static IdentityCaseDecisionRequest decision() {
        IdentityCaseDecisionRequest request = new IdentityCaseDecisionRequest();
        request.setReason("Independent owner review completed");
        return request;
    }
}
