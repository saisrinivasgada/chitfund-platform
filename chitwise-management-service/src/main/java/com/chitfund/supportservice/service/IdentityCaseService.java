package com.chitfund.supportservice.service;

import com.chitfund.supportservice.domain.entity.Employee;
import com.chitfund.supportservice.domain.entity.IdentityCase;
import com.chitfund.supportservice.domain.entity.IdentityCaseAudit;
import com.chitfund.supportservice.domain.entity.SupportTicket;
import com.chitfund.supportservice.domain.enums.IdentityCaseStatus;
import com.chitfund.supportservice.dto.request.IdentityCaseDecisionRequest;
import com.chitfund.supportservice.dto.request.PrepareIdentityCaseRequest;
import com.chitfund.supportservice.dto.response.IdentityCaseResponse;
import com.chitfund.supportservice.dto.response.PagedResponse;
import com.chitfund.supportservice.repository.EmployeeRepository;
import com.chitfund.supportservice.repository.IdentityCaseAuditRepository;
import com.chitfund.supportservice.repository.IdentityCaseRepository;
import com.chitfund.supportservice.client.IdentityExecutionClient;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class IdentityCaseService {
    private final IdentityCaseRepository repository;
    private final IdentityCaseAuditRepository auditRepository;
    private final EmployeeRepository employeeRepository;
    private final ObjectMapper objectMapper;
    private final IdentityExecutionClient executionClient;
    private final PlatformTransactionManager transactionManager;

    @Transactional
    public IdentityCase openForTicket(SupportTicket ticket) {
        if (ticket.getAccountCaseSubtype() == null) {
            throw new IllegalArgumentException("Account case subtype is required for an Account ticket");
        }
        IdentityCase identityCase = IdentityCase.builder()
                .id(UUID.randomUUID().toString())
                .ticketId(ticket.getId())
                .subtype(ticket.getAccountCaseSubtype())
                .tenantId(ticket.getTenantId())
                .memberId(ticket.getSubjectMemberId())
                .subjectUserId(ticket.getSubjectUserId())
                .status(IdentityCaseStatus.OPEN)
                .build();
        return repository.save(identityCase);
    }

    @Transactional(readOnly = true)
    public PagedResponse<IdentityCaseResponse> list(String actorId, IdentityCaseStatus status, int page, int size) {
        requireReader(actorId);
        Page<IdentityCase> result = status == null
                ? repository.findAllByOrderByUpdatedAtDesc(PageRequest.of(Math.max(0, page), Math.min(Math.max(size, 1), 100)))
                : repository.findAllByStatusOrderByUpdatedAtDesc(status, PageRequest.of(Math.max(0, page), Math.min(Math.max(size, 1), 100)));
        return PagedResponse.<IdentityCaseResponse>builder()
                .items(result.getContent().stream().map(this::toResponse).toList())
                .page(result.getNumber()).size(result.getSize()).totalElements(result.getTotalElements())
                .totalPages(result.getTotalPages()).hasNext(result.hasNext()).build();
    }

    @Transactional(readOnly = true)
    public IdentityCaseResponse getByTicket(String actorId, String ticketId) {
        requireReader(actorId);
        return repository.findByTicketId(ticketId).map(this::toResponse).orElse(null);
    }

    @Transactional
    public IdentityCaseResponse prepare(String actorId, String caseId, PrepareIdentityCaseRequest request) {
        requirePreparer(actorId);
        IdentityCase identityCase = locked(caseId);
        if (!(identityCase.getStatus() == IdentityCaseStatus.OPEN
                || identityCase.getStatus() == IdentityCaseStatus.INVESTIGATING
                || identityCase.getStatus() == IdentityCaseStatus.REJECTED
                || identityCase.getStatus() == IdentityCaseStatus.EXECUTION_FAILED)) {
            throw new IllegalStateException("This identity case cannot be prepared in its current state");
        }
        if (identityCase.getSubtype() == com.chitfund.supportservice.domain.enums.AccountCaseSubtype.PHONE_REASSIGNMENT) {
            validatePhoneReassignmentProposal(request);
        }
        try {
            identityCase.setProposalJson(objectMapper.writeValueAsString(request));
        } catch (JsonProcessingException ex) {
            throw new IllegalArgumentException("Invalid identity proposal", ex);
        }
        identityCase.setProposalReason(request.getReason().trim());
        identityCase.setProposedAt(Instant.now());
        identityCase.setProposedBy(actorId);
        identityCase.setAssignedEmployeeId(actorId);
        identityCase.setDecisionReason(null);
        identityCase.setDecidedAt(null);
        identityCase.setDecidedBy(null);
        identityCase.setStatus(IdentityCaseStatus.PROPOSED);
        audit(identityCase.getId(), "PROPOSED", actorId, "Proposal prepared for owner review");
        return toResponse(repository.save(identityCase));
    }

    @Transactional
    public IdentityCaseResponse approve(String actorId, String caseId, IdentityCaseDecisionRequest request) {
        requireOwner(actorId);
        IdentityCase identityCase = locked(caseId);
        if ((identityCase.getStatus() == IdentityCaseStatus.APPROVED
                || identityCase.getStatus() == IdentityCaseStatus.EXECUTING
                || identityCase.getStatus() == IdentityCaseStatus.EXECUTED)
                && actorId.equals(identityCase.getDecidedBy())) {
            if (!request.getReason().trim().equals(identityCase.getDecisionReason())) {
                throw new IllegalStateException(
                        "This identity case was already approved with a different decision reason");
            }
            return toResponse(identityCase);
        }
        if (identityCase.getStatus() != IdentityCaseStatus.PROPOSED) {
            throw new IllegalStateException("Only a proposed identity case can be approved");
        }
        if (actorId.equals(identityCase.getProposedBy())) {
            throw new IllegalStateException("The investigator who prepared a case cannot approve it");
        }
        identityCase.setStatus(IdentityCaseStatus.APPROVED);
        identityCase.setDecidedAt(Instant.now());
        identityCase.setDecidedBy(actorId);
        identityCase.setDecisionReason(request.getReason().trim());
        identityCase.setExecutionKey("identity-case:" + identityCase.getId());
        audit(identityCase.getId(), "APPROVED", actorId, request.getReason().trim());
        return toResponse(repository.save(identityCase));
    }

    @Transactional
    public IdentityCaseResponse reject(String actorId, String caseId, IdentityCaseDecisionRequest request) {
        requireOwner(actorId);
        IdentityCase identityCase = locked(caseId);
        if (identityCase.getStatus() != IdentityCaseStatus.PROPOSED) {
            throw new IllegalStateException("Only a proposed identity case can be rejected");
        }
        identityCase.setStatus(IdentityCaseStatus.REJECTED);
        identityCase.setDecidedAt(Instant.now());
        identityCase.setDecidedBy(actorId);
        identityCase.setDecisionReason(request.getReason().trim());
        audit(identityCase.getId(), "REJECTED", actorId, request.getReason().trim());
        return toResponse(repository.save(identityCase));
    }

    public IdentityCaseResponse execute(String actorId, String caseId) {
        requireOwner(actorId);
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        IdentityCase claimed = tx.execute(status -> {
            IdentityCase c = locked(caseId);
            boolean staleExecution = c.getStatus() == IdentityCaseStatus.EXECUTING
                    && c.getExecutingAt() != null && c.getExecutingAt().isBefore(Instant.now().minusSeconds(300));
            if (!(c.getStatus() == IdentityCaseStatus.APPROVED
                    || c.getStatus() == IdentityCaseStatus.EXECUTION_FAILED || staleExecution)) {
                if (c.getStatus() == IdentityCaseStatus.EXECUTED) return c;
                throw new IllegalStateException("Only an approved or failed identity case can be executed");
            }
            if (c.getSubtype() != com.chitfund.supportservice.domain.enums.AccountCaseSubtype.PHONE_REASSIGNMENT) {
                throw new IllegalStateException("This identity case does not have an automated execution operation");
            }
            c.setStatus(IdentityCaseStatus.EXECUTING);
            c.setExecutingAt(Instant.now());
            c.setLastError(null);
            audit(c.getId(), "EXECUTION_CLAIMED", actorId, "Approved operation claimed for execution");
            return repository.save(c);
        });
        if (claimed.getStatus() == IdentityCaseStatus.EXECUTED) return toResponse(claimed);

        try {
            var result = executionClient.executePhoneReassignment(claimed.getExecutionKey(), claimed.getProposalJson());
            return tx.execute(status -> {
                IdentityCase c = locked(caseId);
                try {
                    c.setExecutionResult(objectMapper.writeValueAsString(result));
                } catch (JsonProcessingException ex) {
                    throw new IllegalStateException("Could not store identity execution result", ex);
                }
                c.setStatus(IdentityCaseStatus.EXECUTED);
                c.setExecutedAt(Instant.now());
                c.setExecutingAt(null);
                c.setLastError(null);
                audit(c.getId(), "EXECUTED", actorId, "Phone identity operation completed idempotently");
                return toResponse(repository.save(c));
            });
        } catch (RuntimeException ex) {
            tx.executeWithoutResult(status -> {
                IdentityCase c = locked(caseId);
                c.setStatus(IdentityCaseStatus.EXECUTION_FAILED);
                c.setExecutingAt(null);
                c.setLastError("Internal identity execution failed; retry is safe with the same operation key");
                audit(c.getId(), "EXECUTION_FAILED", actorId, ex.getClass().getSimpleName());
                repository.save(c);
            });
            throw ex;
        }
    }

    private IdentityCase locked(String id) {
        return repository.findByIdForUpdate(id).orElseThrow(() -> new IllegalArgumentException("Identity case not found"));
    }

    private void validatePhoneReassignmentProposal(PrepareIdentityCaseRequest request) {
        if (request.getOldUserId() == null || request.getPhoneCountryCode() == null
                || request.getPhone() == null || request.getEmail() == null || request.getEmail().isBlank()
                || request.getApprovedMemberLinks() == null
                || request.getApprovedMemberLinks().isEmpty()) {
            throw new IllegalArgumentException("Phone reassignment requires the old user, new email, phone and at least one explicitly approved member profile");
        }
        UUID.fromString(request.getOldUserId());
        if (!request.getPhone().matches("\\d{7,15}") || !request.getPhoneCountryCode().matches("\\+\\d{1,4}")) {
            throw new IllegalArgumentException("Enter a valid country code and phone number");
        }
        if (!request.getEmail().matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) {
            throw new IllegalArgumentException("Enter a valid email for the new identity");
        }
        Set<String> distinct = new HashSet<>();
        for (PrepareIdentityCaseRequest.MemberLink link : request.getApprovedMemberLinks()) {
            if (link.getTenantId() == null || link.getMemberId() == null) {
                throw new IllegalArgumentException("Every approved profile requires a tenant and member ID");
            }
            UUID.fromString(link.getTenantId());
            UUID.fromString(link.getMemberId());
            if (!distinct.add(link.getTenantId() + ":" + link.getMemberId())) {
                throw new IllegalArgumentException("The same member profile cannot be approved twice");
            }
        }
    }

    private Employee employee(String id) {
        return employeeRepository.findById(id).filter(Employee::isActive)
                .orElseThrow(() -> new IllegalArgumentException("Active employee not found"));
    }

    private void requireReader(String actorId) {
        Employee employee = employee(actorId);
        if (!employee.isCanManageIdentityCases() && !employee.isPlatformOwner()) throw new SecurityException("Identity case access denied");
    }

    private void requirePreparer(String actorId) { requireReader(actorId); }

    private void requireOwner(String actorId) {
        if (!employee(actorId).isPlatformOwner()) throw new SecurityException("Protected owner approval is required");
    }

    private void audit(String caseId, String action, String actorId, String details) {
        auditRepository.save(IdentityCaseAudit.builder().id(UUID.randomUUID().toString())
                .identityCaseId(caseId).action(action).actorId(actorId).details(details).build());
    }

    private IdentityCaseResponse toResponse(IdentityCase c) {
        return IdentityCaseResponse.builder()
                .id(c.getId()).ticketId(c.getTicketId()).subtype(c.getSubtype()).tenantId(c.getTenantId())
                .memberId(c.getMemberId()).subjectUserId(c.getSubjectUserId()).status(c.getStatus())
                .assignedEmployeeId(c.getAssignedEmployeeId()).proposalJson(c.getProposalJson())
                .proposalReason(c.getProposalReason()).proposedAt(c.getProposedAt()).proposedBy(c.getProposedBy())
                .decidedAt(c.getDecidedAt()).decidedBy(c.getDecidedBy()).decisionReason(c.getDecisionReason())
                .lastError(c.getLastError()).executedAt(c.getExecutedAt()).createdAt(c.getCreatedAt()).updatedAt(c.getUpdatedAt())
                .build();
    }
}
