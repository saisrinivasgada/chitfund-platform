package com.chitfund.common.offline;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import org.springframework.http.*;
import org.springframework.web.client.*;
import java.util.Map;

/** Live add-on/account checks plus a current signed READ grant before bulk downloads. */
public final class OfflineDownloadAccess {
    private final RestTemplate http;
    private final String userServiceUrl;
    private final String internalKey;
    public OfflineDownloadAccess(RestTemplate http,String userServiceUrl,String internalKey) {
        this.http=http;this.userServiceUrl=userServiceUrl;this.internalKey=internalKey;
    }
    public void authorize(String actor,String role,String token) {
        String tenant=TenantContext.get();
        if(actor==null||actor.isBlank()||!java.util.Set.of("ADMIN","MANAGER","STAFF","MEMBER").contains(role==null?"":role)||tenant==null||tenant.isBlank()||token==null||token.isBlank()) throw new BusinessException(ErrorCode.FORBIDDEN,"A verified offline download grant is required");
        var headers=new HttpHeaders();headers.set("X-Internal-Key",internalKey);headers.setContentType(MediaType.APPLICATION_JSON);
        var body=new OfflineReconciliationRequest(actor,tenant,role,"READ",token,null);
        try {
            var response=http.exchange(userServiceUrl+"/internal/offline-access/verify-read-access",HttpMethod.POST,new HttpEntity<>(body,headers),Map.class);
            if(response.getStatusCode().is2xxSuccessful()&&response.getBody()!=null&&response.getBody().get("grantId") instanceof String id&&!id.isBlank())return;
        } catch(HttpStatusCodeException denied) {
            if(denied.getStatusCode().value()==403)throw new BusinessException(ErrorCode.FORBIDDEN,"Offline download access is no longer available for this account",HttpStatus.FORBIDDEN);
        } catch(RestClientException unavailable) { /* Never substitute an old entitlement on an authority outage. */ }
        throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR,"Offline download access could not be verified. Please retry.",HttpStatus.SERVICE_UNAVAILABLE);
    }
}
