package com.chitfund.supportservice.security;

import com.chitfund.supportservice.domain.entity.Employee;
import com.chitfund.supportservice.repository.EmployeeRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class HubJwtAuthFilterTest {

    @Mock HubJwtTokenProvider tokenProvider;
    @Mock EmployeeRepository employeeRepository;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void temporaryPasswordSessionCannotAccessHubOperations() throws Exception {
        Employee employee = employee(true);
        stubToken(employee);
        MockHttpServletRequest request = request("/api/hub/tickets");
        MockHttpServletResponse response = new MockHttpServletResponse();

        new HubJwtAuthFilter(tokenProvider, employeeRepository)
                .doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentAsString()).contains("PASSWORD_CHANGE_REQUIRED");
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void temporaryPasswordSessionCanChangePassword() throws Exception {
        Employee employee = employee(true);
        stubToken(employee);
        MockHttpServletResponse response = new MockHttpServletResponse();

        new HubJwtAuthFilter(tokenProvider, employeeRepository)
                .doFilter(request("/api/hub/auth/change-password"), response, new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
        assertThat(response.getStatus()).isEqualTo(200);
    }

    private void stubToken(Employee employee) {
        when(tokenProvider.validateToken("hub-token")).thenReturn(true);
        when(tokenProvider.extractEmployeeId("hub-token")).thenReturn(employee.getId());
        when(tokenProvider.extractAuthVersion("hub-token")).thenReturn(employee.getAuthVersion());
        when(employeeRepository.findById(employee.getId())).thenReturn(Optional.of(employee));
    }

    private MockHttpServletRequest request(String path) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
        request.addHeader("Authorization", "Bearer hub-token");
        return request;
    }

    private Employee employee(boolean mustChangePassword) {
        return Employee.builder()
                .id("EMP-002")
                .email("employee@example.com")
                .fullName("Employee")
                .username("employee")
                .passwordHash("hash")
                .role("SUPPORT_AGENT")
                .active(true)
                .mustChangePassword(mustChangePassword)
                .authVersion(3)
                .build();
    }
}
