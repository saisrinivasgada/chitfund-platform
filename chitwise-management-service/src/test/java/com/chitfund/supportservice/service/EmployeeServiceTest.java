package com.chitfund.supportservice.service;

import com.chitfund.supportservice.domain.entity.Employee;
import com.chitfund.supportservice.dto.request.AcceptInviteRequest;
import com.chitfund.supportservice.dto.request.ChangeEmployeePasswordRequest;
import com.chitfund.supportservice.dto.request.EmployeeLoginRequest;
import com.chitfund.supportservice.dto.request.InviteEmployeeRequest;
import com.chitfund.supportservice.dto.request.ResetEmployeePasswordRequest;
import com.chitfund.supportservice.repository.EmployeeRepository;
import com.chitfund.supportservice.security.HubJwtTokenProvider;
import com.chitfund.supportservice.security.OrgJwtTokenProvider;
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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EmployeeServiceTest {

    @Mock EmployeeRepository repository;
    @Mock HubJwtTokenProvider tokenProvider;
    @Mock OrgJwtTokenProvider orgTokenProvider;
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

    @Test
    void superAdminLoginReturnsHubAndSaasTokensFromOneIdentity() {
        Employee employee = activeEmployee("SUPER_ADMIN");
        EmployeeLoginRequest request = new EmployeeLoginRequest();
        request.setUsername(employee.getUsername());
        request.setPassword("Password@1");
        when(repository.findByUsername(employee.getUsername())).thenReturn(Optional.of(employee));
        when(passwordEncoder.matches("Password@1", "old-hash")).thenReturn(true);
        when(repository.save(employee)).thenReturn(employee);
        when(tokenProvider.generateToken(employee)).thenReturn("hub-token");
        when(orgTokenProvider.generateHubSuperAdminToken(employee)).thenReturn("saas-token");

        var response = service().login(request);

        assertThat(response.getToken()).isEqualTo("hub-token");
        assertThat(response.getSaasToken()).isEqualTo("saas-token");
        assertThat(response.isMustChangePassword()).isFalse();
    }

    @Test
    void resettingPasswordStoresOnlyHashForcesChangeAndRevokesOldTokens() {
        Employee employee = activeEmployee("SUPPORT_AGENT");
        ResetEmployeePasswordRequest request = new ResetEmployeePasswordRequest();
        request.setTemporaryPassword("TempPass@9");
        when(repository.findById(employee.getId())).thenReturn(Optional.of(employee));
        when(passwordEncoder.encode("TempPass@9")).thenReturn("new-bcrypt-hash");
        when(repository.save(employee)).thenReturn(employee);

        service().resetPassword(employee.getId(), "super-admin-id", request);

        assertThat(employee.getPasswordHash()).isEqualTo("new-bcrypt-hash");
        assertThat(employee.getPasswordHash()).doesNotContain("TempPass@9");
        assertThat(employee.isMustChangePassword()).isTrue();
        assertThat(employee.getAuthVersion()).isEqualTo(1);
    }

    @Test
    void changingTemporaryPasswordClearsRestrictionAndIssuesRotatedTokens() {
        Employee employee = activeEmployee("SUPER_ADMIN");
        employee.setMustChangePassword(true);
        employee.setAuthVersion(4);
        ChangeEmployeePasswordRequest request = new ChangeEmployeePasswordRequest();
        request.setCurrentPassword("TempPass@9");
        request.setNewPassword("Permanent@8");
        when(repository.findById(employee.getId())).thenReturn(Optional.of(employee));
        when(passwordEncoder.matches("TempPass@9", "old-hash")).thenReturn(true);
        when(passwordEncoder.matches("Permanent@8", "old-hash")).thenReturn(false);
        when(passwordEncoder.encode("Permanent@8")).thenReturn("permanent-bcrypt-hash");
        when(repository.save(employee)).thenReturn(employee);
        when(tokenProvider.generateToken(employee)).thenReturn("rotated-hub-token");
        when(orgTokenProvider.generateHubSuperAdminToken(employee)).thenReturn("rotated-saas-token");

        var response = service().changePassword(employee.getId(), request);

        assertThat(employee.isMustChangePassword()).isFalse();
        assertThat(employee.getAuthVersion()).isEqualTo(5);
        assertThat(employee.getPasswordHash()).isEqualTo("permanent-bcrypt-hash");
        assertThat(response.getToken()).isEqualTo("rotated-hub-token");
        assertThat(response.getSaasToken()).isEqualTo("rotated-saas-token");
    }

    @Test
    void supportAgentNeverReceivesSaasToken() {
        Employee employee = activeEmployee("SUPPORT_AGENT");
        when(tokenProvider.generateToken(employee)).thenReturn("hub-token");

        var response = invokeLoginResponse(employee);

        assertThat(response.getSaasToken()).isNull();
        verify(orgTokenProvider, never()).generateHubSuperAdminToken(any());
    }

    private com.chitfund.supportservice.dto.response.EmployeeLoginResponse invokeLoginResponse(Employee employee) {
        EmployeeLoginRequest request = new EmployeeLoginRequest();
        request.setUsername(employee.getUsername());
        request.setPassword("Password@1");
        when(repository.findByUsername(employee.getUsername())).thenReturn(Optional.of(employee));
        when(passwordEncoder.matches("Password@1", "old-hash")).thenReturn(true);
        when(repository.save(employee)).thenReturn(employee);
        return service().login(request);
    }

    private Employee activeEmployee(String role) {
        return Employee.builder()
                .id("employee-1")
                .employeeNumber(1L)
                .email("employee@example.com")
                .fullName("Hub Employee")
                .username("hub-employee")
                .passwordHash("old-hash")
                .role(role)
                .active(true)
                .inviteAcceptedAt(java.time.Instant.now())
                .authVersion(0)
                .build();
    }

    private EmployeeService service() {
        return new EmployeeService(repository, tokenProvider, orgTokenProvider, passwordEncoder, invitationMailer);
    }
}
