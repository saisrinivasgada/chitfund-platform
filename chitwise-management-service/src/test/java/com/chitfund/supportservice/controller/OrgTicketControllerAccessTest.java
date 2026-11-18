package com.chitfund.supportservice.controller;

import com.chitfund.supportservice.dto.request.CreateTicketRequest;
import com.chitfund.supportservice.dto.request.SendMessageRequest;
import com.chitfund.supportservice.service.TicketService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class OrgTicketControllerAccessTest {
    private final TicketService service = mock(TicketService.class);
    private final OrgTicketController controller = new OrgTicketController(service);

    @Test
    void managerAndStaffCannotReadOrChangeSupportTickets() {
        for (String role : new String[] {"MANAGER", "STAFF"}) {
            MockHttpServletRequest request = request(role);
            assertThat(controller.createTicket(new CreateTicketRequest(), request).getStatusCode().value()).isEqualTo(403);
            assertThat(controller.listTickets(0, 20, request).getStatusCode().value()).isEqualTo(403);
            assertThat(controller.getTicket("ticket-1", request).getStatusCode().value()).isEqualTo(403);
            assertThat(controller.getMessages("ticket-1", null, 50, request).getStatusCode().value()).isEqualTo(403);
            assertThat(controller.sendMessage("ticket-1", new SendMessageRequest(), request).getStatusCode().value()).isEqualTo(403);
            assertThat(controller.deleteMessage("ticket-1", "message-1", request).getStatusCode().value()).isEqualTo(403);
            assertThat(controller.markRead("ticket-1", request).getStatusCode().value()).isEqualTo(403);
        }
        verifyNoInteractions(service);
    }

    private MockHttpServletRequest request(String role) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-User-Id", "user-1");
        request.addHeader("X-User-Role", role);
        request.addHeader("X-Tenant-Id", "tenant-1");
        return request;
    }
}
