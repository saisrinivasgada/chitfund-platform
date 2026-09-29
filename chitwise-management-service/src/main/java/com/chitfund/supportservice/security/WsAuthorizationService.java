package com.chitfund.supportservice.security;

import com.chitfund.supportservice.repository.ChatGroupMemberRepository;
import com.chitfund.supportservice.repository.ChatGroupRepository;
import com.chitfund.supportservice.repository.ConversationRepository;
import com.chitfund.supportservice.repository.HubConversationRepository;
import com.chitfund.supportservice.repository.HubGroupMemberRepository;
import com.chitfund.supportservice.repository.SupportTicketRepository;
import com.chitfund.supportservice.repository.EmployeeRepository;
import com.chitfund.supportservice.domain.entity.Employee;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * Verifies that a WebSocket subscriber is allowed to listen on a given STOMP topic.
 * Called from the SUBSCRIBE interceptor in WebSocketConfig.
 */
@Service
@RequiredArgsConstructor
public class WsAuthorizationService {

    private final ConversationRepository conversationRepo;
    private final SupportTicketRepository ticketRepo;
    private final ChatGroupRepository groupRepo;
    private final ChatGroupMemberRepository groupMemberRepo;
    private final HubConversationRepository hubConvRepo;
    private final HubGroupMemberRepository hubGroupMemberRepo;
    private final EmployeeRepository employeeRepo;

    /**
     * Hub access tokens are not sufficient by themselves: deactivation, password
     * reset and role changes must invalidate a socket before it is established.
     */
    public Optional<Employee> authenticateHubEmployee(String employeeId, long tokenAuthVersion) {
        return employeeRepo.findById(employeeId)
                .filter(Employee::isActive)
                .filter(employee -> !employee.isMustChangePassword())
                .filter(employee -> employee.getAuthVersion() == tokenAuthVersion);
    }

    /**
     * Can this user subscribe to /topic/conversation.{convId}?
     * - Authenticated Hub employees can subscribe to any conversation.
     * - Org users: conversation must belong to their tenant.
     * - Member role: conversation.memberId must match their userId.
     */
    public boolean canSubscribeToConversation(String convId, String tenantId,
                                               String userId, String role, boolean isHub) {
        if (isHub) return true;
        if (tenantId == null) return false;

        return conversationRepo.findById(convId)
                .map(conv -> {
                    if (!conv.getTenantId().equals(tenantId)) return false;
                    if ("MEMBER".equals(role) && !conv.getMemberId().equals(userId)) return false;
                    return true;
                })
                .orElse(false);
    }

    /**
     * Can this user subscribe to /topic/support-ticket.{ticketId}?
     * - Authenticated Hub employees: yes.
     * - Org users: ticket must belong to their tenant.
     */
    public boolean canSubscribeToTicket(String ticketId, String tenantId,
                                        String userId, String role, boolean isHub) {
        if (isHub) return true;
        if (tenantId == null) return false;

        return ticketRepo.findById(ticketId)
                .map(ticket -> ticket.getTenantId().equals(tenantId)
                        && (!"MEMBER".equals(role)
                            || java.util.Objects.equals(ticket.getCreatedBy(), userId)))
                .orElse(false);
    }

    /**
     * Hub employees can subscribe to the global pool topic.
     */
    public boolean canSubscribeToPool(boolean isHub) {
        return isHub;
    }

    /**
     * Can this user subscribe to /topic/group.{groupId}?
     * - User must be a member of the group.
     * - Group must belong to the user's tenant.
     */
    public boolean canSubscribeToGroup(String groupId, String tenantId,
                                       String userId, boolean isHub) {
        if (isHub) return true;
        if (tenantId == null) return false;

        return groupRepo.findByIdAndTenantId(groupId, tenantId)
                .map(group -> groupMemberRepo.existsByGroupIdAndUserId(groupId, userId))
                .orElse(false);
    }

    /**
     * Can this hub employee subscribe to /topic/hub.dm.{convId}?
     * Caller must be employee1 or employee2 of the conversation.
     */
    public boolean canSubscribeToHubDm(String convId, String employeeId) {
        return hubConvRepo.findById(convId)
                .map(c -> c.getEmployee1Id().equals(employeeId) || c.getEmployee2Id().equals(employeeId))
                .orElse(false);
    }

    /**
     * Can this hub employee subscribe to /topic/hub.group.{groupId}?
     * Caller must be a member of the hub group.
     */
    public boolean canSubscribeToHubGroup(String groupId, String employeeId) {
        return hubGroupMemberRepo.existsByGroupIdAndEmployeeId(groupId, employeeId);
    }
}
