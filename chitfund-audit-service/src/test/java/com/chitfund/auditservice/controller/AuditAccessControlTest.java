package com.chitfund.auditservice.controller;

import com.chitfund.auditservice.service.AuditService;
import com.chitfund.common.context.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

/** Exercise the actual method-security proxies, including every organisation history entry point. */
@SpringJUnitConfig(AuditAccessControlTest.Config.class)
class AuditAccessControlTest {
    @Autowired AuditQueryController organisation;
    @Autowired SuperAdminAuditController platform;
    @Autowired AuditService service;
    final PageRequest page = PageRequest.of(0, 50);

    @BeforeEach void setup() { reset(service); TenantContext.set("org-a"); }
    @AfterEach void clear() { TenantContext.clear(); SecurityContextHolder.clearContext(); }
    void signIn(String role) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                "actor", null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }
    List<Runnable> organisationQueries() {
        return List.of(
                () -> organisation.search(null, null, null, null, null, null, null, null, null, null, null, page),
                () -> organisation.getEntityHistory("PAYMENT", "payment-b", page),
                () -> organisation.getChitHistory("chit-b", page),
                () -> organisation.getActorHistory("actor-b", page));
    }

    @ParameterizedTest @ValueSource(strings = {"ADMIN", "MANAGER"})
    void authorisedOrganisationRolesAlwaysPassTheirOwnScope(String role) {
        signIn(role);
        organisationQueries().forEach(query -> assertThatCode(query::run).doesNotThrowAnyException());
        verify(service).search(eq("org-a"), isNull(), isNull(), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), eq(page));
        verify(service).getEntityHistory("PAYMENT", "payment-b", "org-a", page);
        verify(service).getChitHistory("chit-b", "org-a", page);
        verify(service).getActorHistory("actor-b", "org-a", page);
    }

    @ParameterizedTest @ValueSource(strings = {"STAFF", "MEMBER", "SUPER_ADMIN", "EMPLOYEE"})
    void otherRolesCannotReadOrganisationFinancialHistory(String role) {
        signIn(role);
        organisationQueries().forEach(query -> assertThatThrownBy(query::run).isInstanceOf(AccessDeniedException.class));
        verifyNoInteractions(service);
    }

    @ParameterizedTest @ValueSource(strings = {"ADMIN", "MANAGER", "STAFF", "MEMBER", "EMPLOYEE"})
    void onlySuperAdminCanReadAcrossOrganisations(String role) {
        signIn(role);
        assertThatThrownBy(() -> platform.search(null, null, null, null, null, null, null, null, null, page))
                .isInstanceOf(AccessDeniedException.class);
        verifyNoInteractions(service);
    }

    @Test void superAdminUsesTheSeparateCrossOrganisationEndpoint() {
        signIn("SUPER_ADMIN"); TenantContext.clear();
        assertThatCode(() -> platform.search(null, null, null, null, null, null, null, null, null, page))
                .doesNotThrowAnyException();
        verify(service).search(isNull(), isNull(), isNull(), isNull(), isNull(), isNull(),
                isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), eq(page));
    }

    @Test void authorisedRoleWithoutOrganisationFailsClosedOnEveryHistoryRoute() {
        signIn("ADMIN"); TenantContext.set(" ");
        organisationQueries().forEach(query -> assertThatThrownBy(query::run).isInstanceOf(AccessDeniedException.class));
        verifyNoInteractions(service);
    }

    @Configuration @EnableMethodSecurity
    static class Config {
        @Bean AuditService auditService() { return mock(AuditService.class); }
        @Bean AuditQueryController organisation(AuditService service) { return new AuditQueryController(service); }
        @Bean SuperAdminAuditController platform(AuditService service) { return new SuperAdminAuditController(service); }
    }
}
