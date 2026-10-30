package com.chitfund.userservice.service;

import com.chitfund.userservice.outbox.MemberActivationCommandOutbox;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.event.NotificationEventPublisher;
import com.chitfund.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.context.event.EventListener;

import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class IdentityNotificationListener {
    private final NotificationEventPublisher eventPublisher;
    private final MemberActivationCommandOutbox activationOutbox;
    private final UserRepository userRepository;

    @EventListener
    public void onIdentityNotification(IdentityNotificationEvent event) {
        deliver(event);
    }

    private void deliver(IdentityNotificationEvent event) {
        switch (event.type()) {
            case CHITFUND_REQUEST_CREATED -> {
                String org = event.organizationName() == null ? "An organization" : event.organizationName();
                eventPublisher.publishInApp(event.tenantId().toString(), event.recipientUserId(), "New Chitfund Request",
                        org + " asked to connect a member profile to your ChitWise account.",
                        "CHITFUND_REQUEST", null, "/member/chitfund-requests");
                eventPublisher.publishPush(event.tenantId().toString(), event.recipientUserId(),
                        "New Chitfund Request",
                        org + " sent an app-access request.",
                        Map.of("type", "CHITFUND_REQUEST", "requestId", event.requestId().toString()));
            }
            case CHITFUND_ACCESS_ACTIVATED -> {
                if (event.activationTenantId() != null && event.activationMemberId() != null) {
                    activationOutbox.enqueue(event.requestId(), event.activationTenantId(),
                            event.activationMemberId(), event.recipientUserId());
                }
                eventPublisher.publishInApp(
                        event.tenantId().toString(), event.recipientUserId(), "Chitfund Access Active",
                        "Your verified member profile is now active for " + event.organizationName() + ".",
                        "CHITFUND_REQUEST", null, "/member/chitfund-requests");
                String approvalEmail = resolveEmail(event);
                if (approvalEmail != null) {
                    String org = event.organizationName() == null ? "the organization" : event.organizationName();
                    String name = resolveDisplayName(event);
                    eventPublisher.publishEmail(approvalEmail,
                            "Your ChitWise app access is active — " + org,
                            EmailService.buildApprovalHtml(name, org),
                            EmailService.buildApprovalText(name, org));
                }
            }
            case CHITFUND_ACCESS_SUSPENDED -> {
                String suspOrg = event.organizationName() == null ? "The organization" : event.organizationName();
                eventPublisher.publishInApp(
                        event.tenantId().toString(), event.recipientUserId(), "App Access Suspended",
                        suspOrg + " has suspended your ChitWise app access for this organisation.",
                        "CHITFUND_REQUEST", null, "/member/chitfund-requests");
                String suspEmail = resolveEmail(event);
                if (suspEmail != null) {
                    String name = resolveDisplayName(event);
                    eventPublisher.publishEmail(suspEmail,
                            "Your ChitWise app access has been suspended — " + suspOrg,
                            EmailService.buildSuspensionEmailHtml(name, suspOrg),
                            EmailService.buildSuspensionEmailText(name, suspOrg));
                }
            }
            case CHITFUND_REQUEST_REVOKED -> {
                eventPublisher.publishInApp(
                        event.tenantId().toString(), event.recipientUserId(), "App Access Request Cancelled",
                        (event.organizationName() == null ? "The organization" : event.organizationName())
                                + " has cancelled your app-access request.",
                        "CHITFUND_REQUEST", null, "/member/chitfund-requests");
                String revocationEmail = resolveEmail(event);
                if (revocationEmail != null) {
                    String org = event.organizationName() == null ? "the organization" : event.organizationName();
                    String name = resolveDisplayName(event);
                    eventPublisher.publishEmail(revocationEmail,
                            "Your ChitWise app-access request was cancelled — " + org,
                            EmailService.buildRevocationHtml(name, org),
                            EmailService.buildRevocationText(name, org));
                }
            }
            case PHONE_IDENTITY_REASSIGNED -> {
                eventPublisher.publishInApp(null, event.recipientUserId(), "Account identity updated",
                        "A support-approved phone identity change was completed. Your historical organization and financial records were not transferred or deleted.",
                        "ACCOUNT_ACCESS", null, "/member/support");
                for (var tenantId : event.affectedTenantIds() == null ? List.<java.util.UUID>of() : event.affectedTenantIds()) {
                    userRepository.findByTenantIdAndRoleInAndDeletedAtIsNull(
                                    tenantId.toString(), List.of(Role.ADMIN))
                            .forEach(admin -> eventPublisher.publishInApp(tenantId.toString(), admin.getId(),
                                    "Member identity access updated",
                                    "ChitWise Support completed an approved identity-access change affecting a member profile in your organization. Financial history was not changed.",
                                    "ACCOUNT_ACCESS", null, "/support"));
                }
            }
        }
    }

    private String resolveEmail(IdentityNotificationEvent event) {
        return userRepository.findById(event.recipientUserId())
                .map(u -> u.getEmail() != null ? u.getEmail() : event.requestedEmail())
                .orElse(event.requestedEmail());
    }

    private String resolveDisplayName(IdentityNotificationEvent event) {
        return userRepository.findById(event.recipientUserId())
                .map(u -> u.getFullName() != null && !u.getFullName().isBlank() ? u.getFullName() : null)
                .orElse(null);
    }
}
