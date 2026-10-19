package com.chitfund.common.offline;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import org.junit.jupiter.api.*;
import org.springframework.http.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.test.web.client.MockRestServiceServer;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class OfflineDownloadAccessTest {
    final RestTemplate http=new RestTemplate();
    final MockRestServiceServer server=MockRestServiceServer.bindTo(http).build();
    final OfflineDownloadAccess access=new OfflineDownloadAccess(http,"http://users","internal-test");
    final UUID actor=UUID.randomUUID();

    @BeforeEach void tenant(){TenantContext.set("org-a");}
    @AfterEach void clear(){TenantContext.clear();}
    @Test void liveReadCheckIsPinnedToAuthenticatedActorTenantRoleAndGrant(){
        server.expect(requestTo("http://users/internal/offline-access/verify-read-access"))
            .andExpect(method(HttpMethod.POST)).andExpect(header("X-Internal-Key","internal-test"))
            .andExpect(content().json("{\"actorId\":\""+actor+"\",\"tenantId\":\"org-a\",\"role\":\"ADMIN\",\"action\":\"READ\",\"token\":\"signed-read-grant\",\"recordedAt\":null}"))
            .andRespond(withSuccess("{\"grantId\":\"verified\"}",MediaType.APPLICATION_JSON));
        access.authorize(actor.toString(),"ADMIN","signed-read-grant");server.verify();
    }
    @Test void missingGrantNeverRequestsAuthorityOrData(){
        assertThatThrownBy(()->access.authorize(actor.toString(),"ADMIN",null)).isInstanceOf(BusinessException.class);server.verify();
    }
    @Test void authorityOutageFailsClosed(){
        server.expect(anything()).andRespond(withServerError());
        assertThatThrownBy(()->access.authorize(actor.toString(),"ADMIN","proof")).isInstanceOfSatisfying(BusinessException.class,e->assertThat(e.getHttpStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));server.verify();
    }
    @Test void explicitAuthorityDenialRemainsForbidden(){
        server.expect(anything()).andRespond(withStatus(HttpStatus.FORBIDDEN));
        assertThatThrownBy(()->access.authorize(actor.toString(),"ADMIN","proof")).isInstanceOfSatisfying(BusinessException.class,e->assertThat(e.getHttpStatus()).isEqualTo(HttpStatus.FORBIDDEN));server.verify();
    }
}
