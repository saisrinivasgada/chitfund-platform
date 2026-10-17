package com.chitfund.userservice.controller;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.userservice.dto.response.*;
import com.chitfund.userservice.service.*;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.*;
import org.springframework.mock.web.*;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class BrowserAccountSessionControllerTest {
    private final AuthService auth = mock(AuthService.class);
    private final BrowserAccountSessions sessions = new BrowserAccountSessions();
    private final BrowserAccountSessionController controller = new BrowserAccountSessionController(auth, sessions);
    private final UUID actor = UUID.randomUUID();

    @BeforeEach void secureCookies() { ReflectionTestUtils.setField(sessions, "secure", true); }

    private AuthResponse account(String tenant) {
        return AuthResponse.builder().user(UserResponse.builder().id(actor).build())
                .tenant(TenantInfo.builder().tenantId(tenant).role("ADMIN").build())
                .accessToken("access-" + tenant).refreshToken("refresh-" + tenant).build();
    }

    @Test void cookieIsHttpOnlyAndScopedToItsOwnAccountPath() {
        var a = account("org-a");
        var response = new MockHttpServletResponse();
        sessions.write(response, a);
        assertThat(response.getHeader("Set-Cookie"))
                .contains("HttpOnly", "Secure", "SameSite=Strict", "Path=/api/auth/accounts/" + BrowserAccountSessions.id(a))
                .doesNotContain("refresh_token=");
        assertThat(a.getBrowserAccountId()).isEqualTo(BrowserAccountSessions.id(a));
        assertThat(BrowserAccountSessions.id(a)).isNotEqualTo(BrowserAccountSessions.id(account("org-b")));
    }

    @Test void missingAccountCookieCannotFallBackToAnotherAccountOrGenericCookie() {
        var request = new MockHttpServletRequest();
        request.setCookies(new Cookie("refresh_token", "generic-b"),
                new Cookie("chitwise_account_" + BrowserAccountSessions.id(account("org-b")), "refresh-b"));
        assertThatThrownBy(() -> controller.refresh(BrowserAccountSessions.id(account("org-a")), "WEB",
                request, new MockHttpServletResponse())).isInstanceOf(BusinessException.class);
        verifyNoInteractions(auth);
    }

    @Test void backgroundRefreshDoesNotReplaceVisibleAccountCookieAndDoesNotReturnRefreshToken() {
        var a = account("org-a");
        String id = BrowserAccountSessions.id(a);
        var request = new MockHttpServletRequest();
        request.setCookies(new Cookie("chitwise_account_" + id, "old-a"));
        when(auth.refreshByToken("old-a")).thenReturn(a);
        var response = new MockHttpServletResponse();
        var result = controller.refresh(id, "WEB", request, response);
        assertThat(result.getBody().getData().getRefreshToken()).isNull();
        assertThat(result.getBody().getData().getAccessToken()).isEqualTo("access-org-a");
        assertThat(response.getHeader("Set-Cookie")).contains("chitwise_account_" + id + "=refresh-org-a")
                .doesNotContain("refresh_token=");
        assertThat(response.getHeaders("Set-Cookie")).hasSize(1);
        assertThat(result.getHeaders().getCacheControl()).isEqualTo("no-store");
    }

    @Test void misplacedCookieNeverReturnsAnotherAccountsAccessToken() {
        var a = account("org-a");
        var request = new MockHttpServletRequest();
        request.setCookies(new Cookie("chitwise_account_" + BrowserAccountSessions.id(a), "wrong-token"));
        when(auth.refreshByToken("wrong-token")).thenReturn(account("org-b"));
        assertThatThrownBy(() -> controller.refresh(BrowserAccountSessions.id(a), "WEB", request,
                new MockHttpServletResponse())).isInstanceOf(BusinessException.class);
        verify(auth).logout("refresh-org-b");
    }

    @Test void loggingOutAOnlyRevokesAndClearsA() {
        String id = BrowserAccountSessions.id(account("org-a"));
        var request = new MockHttpServletRequest();
        request.setCookies(new Cookie("chitwise_account_" + id, "refresh-a"));
        var response = new MockHttpServletResponse();
        controller.logout(id, "WEB", request, response);
        verify(auth).logout("refresh-a");
        assertThat(response.getHeader("Set-Cookie")).contains("chitwise_account_" + id + "=", "Max-Age=0");
        assertThat(response.getHeaders("Set-Cookie")).hasSize(1);
    }
}
