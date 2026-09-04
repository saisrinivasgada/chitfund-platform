package com.chitfund.supportservice.service;

import com.chitfund.supportservice.domain.entity.Employee;
import com.chitfund.supportservice.dto.request.AcceptInviteRequest;
import com.chitfund.supportservice.dto.request.InviteEmployeeRequest;
import com.chitfund.supportservice.repository.EmployeeRepository;
import com.chitfund.supportservice.security.HubJwtTokenProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EmployeeServiceTest {

    @Mock EmployeeRepository repository;
    @Mock HubJwtTokenProvider tokenProvider;
    @Mock PasswordEncoder passwordEncoder;
    @Mock EmployeeInvitationMailer invitationMailer;

    @Test
    void invitationStoresOnlyHashAndDeliversRawToken() throws Exception {
        InviteEmployeeRequest request = new InviteEmployeeRequest();
        request.setFullName("Support User");
        request.setEmail("support@example.com");
        request.setRole("SUPPORT_AGENT");
        when(repository.save(any(Employee.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service().invite(request);

        ArgumentCaptor<Employee> employeeCaptor = ArgumentCaptor.forClass(Employee.class);
        verify(repository).save(employeeCaptor.capture());
        ArgumentCaptor<String> rawTokenCaptor = ArgumentCaptor.forClass(String.class);
        verify(invitationMailer).sendInvitation(
                org.mockito.ArgumentMatchers.eq("support@example.com"),
                org.mockito.ArgumentMatchers.eq("Support User"), rawTokenCaptor.capture());

        String rawToken = rawTokenCaptor.getValue();
        String expectedHash = HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(rawToken.getBytes(StandardCharsets.UTF_8)));
        assertThat(employeeCaptor.getValue().getInviteToken()).isEqualTo(expectedHash);
        assertThat(employeeCaptor.getValue().getInviteToken()).isNotEqualTo(rawToken);
    }

    @Test
    void acceptingInvitationConsumesTokenAndActivatesEmployee() {
        Employee employee = Employee.builder()
                .id("employee-1")
                .email("support@example.com")
                .fullName("Support User")
                .username("support@example.com")
                .role("SUPPORT_AGENT")
                .inviteToken("stored-hash")
                .inviteExpiresAt(java.time.Instant.now().plusSeconds(60))
                .build();
        AcceptInviteRequest request = new AcceptInviteRequest();
        request.setToken("raw-token");
        request.setUsername("support-user");
        request.setPassword("strong-password");
        when(repository.findByInviteTokenForUpdate(any())).thenReturn(Optional.of(employee));
        when(passwordEncoder.encode("strong-password")).thenReturn("password-hash");
        when(repository.save(employee)).thenReturn(employee);
        when(repository.findById("employee-1")).thenReturn(Optional.of(employee));
        when(tokenProvider.generateToken(employee)).thenReturn("access-token");

        service().acceptInvite(request);

        assertThat(employee.getInviteToken()).isNull();
        assertThat(employee.getInviteAcceptedAt()).isNotNull();
        assertThat(employee.isActive()).isTrue();
        assertThat(employee.getPasswordHash()).isEqualTo("password-hash");
    }

    private EmployeeService service() {
        return new EmployeeService(repository, tokenProvider, passwordEncoder, invitationMailer);
    }
}
