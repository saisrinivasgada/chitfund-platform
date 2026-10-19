package com.chitfund.paymentservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.offline.OfflineSnapshotReader;
import com.chitfund.common.offline.OfflineDownloadAccess;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.client.RestTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import java.util.Map;

import com.chitfund.paymentservice.service.PaymentService;
import com.chitfund.paymentservice.client.MemberServiceClient;
import com.chitfund.common.context.TenantContext;
import java.util.UUID;

@RestController
public class OfflineReadController {
    private final PaymentService service;
    private final MemberServiceClient members;
    private final OfflineSnapshotReader snapshots;
    private final OfflineDownloadAccess access;
    public OfflineReadController(PaymentService service, MemberServiceClient members, JdbcTemplate jdbc, PlatformTransactionManager manager, RestTemplate http,
            @Value("${app.user-service-url:http://localhost:8081}") String userUrl, @Value("${app.internal-key}") String internalKey) {
        this.service = service; this.members = members; this.snapshots = new OfflineSnapshotReader(jdbc, manager);
        this.access = new OfflineDownloadAccess(http,userUrl,internalKey);
    }
    @GetMapping("/payments/batches/offline-pages")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_MANAGER','ROLE_STAFF','ROLE_MEMBER')")
    public ApiResponse<Map<String, Object>> page(@RequestParam(defaultValue="0") int page,
            @RequestParam(defaultValue="200") int size, @RequestParam(required=false) String snapshotVersion,
            Authentication auth, @RequestHeader(value="X-Offline-Authorization",required=false) String offlineAuthorization) {
        access.authorize(auth.getPrincipal().toString(),auth.getAuthorities().stream().map(a->a.getAuthority().replace("ROLE_", "")).filter(r->java.util.Set.of("ADMIN","MANAGER","STAFF","MEMBER").contains(r)).findFirst().orElse(null),offlineAuthorization);
        if (page < 0 || size < 1 || size > 200) throw new com.chitfund.common.exception.BusinessException(
                com.chitfund.common.exception.ErrorCode.CONCURRENT_MODIFICATION, "Download page must contain between 1 and 200 records");
        return ApiResponse.success(snapshots.read(snapshotVersion, () -> {
            boolean manager = auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_MANAGER"));
            UUID actor = (UUID) auth.getPrincipal();
            boolean staff = auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_STAFF"));
            boolean member = auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_MEMBER"));
            UUID profile = member ? members.getProfileIdByUserId(actor, TenantContext.get()) : null;
            if (member && profile == null) throw new com.chitfund.common.exception.BusinessException(com.chitfund.common.exception.ErrorCode.FORBIDDEN, "Member profile is required");
            var result = staff ? service.getPendingCollectorBatchesPaged(actor, page, size)
                    : service.getAllBatchesPaged(null, member ? profile : null, manager ? java.time.LocalDate.now().minusDays(7) : null,
                      manager ? java.time.LocalDate.now() : null, page, size);
            return OfflineSnapshotReader.page(result.getContent(), page, size, result.getTotalElements());
        }));
    }
}
