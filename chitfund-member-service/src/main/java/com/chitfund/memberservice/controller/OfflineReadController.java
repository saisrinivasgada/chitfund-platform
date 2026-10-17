package com.chitfund.memberservice.controller;

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

import com.chitfund.memberservice.service.MemberService;

@RestController
public class OfflineReadController {
    private final MemberService service;
    private final OfflineSnapshotReader snapshots;
    private final OfflineDownloadAccess access;
    public OfflineReadController(MemberService service, JdbcTemplate jdbc, PlatformTransactionManager manager, RestTemplate http,
            @Value("${app.user-service-url:http://localhost:8081}") String userUrl, @Value("${app.internal-key}") String internalKey) {
        this.service = service; this.snapshots = new OfflineSnapshotReader(jdbc, manager);
        this.access = new OfflineDownloadAccess(http,userUrl,internalKey);
    }
    @GetMapping("/members/offline-pages")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN','ROLE_MANAGER','ROLE_STAFF')")
    public ApiResponse<Map<String, Object>> page(@RequestParam(defaultValue="0") int page,
            @RequestParam(defaultValue="200") int size, @RequestParam(required=false) String snapshotVersion,
            Authentication auth, @RequestHeader(value="X-Offline-Authorization",required=false) String offlineAuthorization) {
        access.authorize(auth.getPrincipal().toString(),auth.getAuthorities().stream().map(a->a.getAuthority().replace("ROLE_", "")).filter(r->java.util.Set.of("ADMIN","MANAGER","STAFF","MEMBER").contains(r)).findFirst().orElse(null),offlineAuthorization);
        if (page < 0 || size < 1 || size > 200) throw new com.chitfund.common.exception.BusinessException(
                com.chitfund.common.exception.ErrorCode.CONCURRENT_MODIFICATION, "Download page must contain between 1 and 200 records");
        return ApiResponse.success(snapshots.read(snapshotVersion, () -> {
            var result = service.search(null, null, PageRequest.of(page, size, Sort.by("createdAt").descending().and(Sort.by("id"))));
            return OfflineSnapshotReader.page(result.getContent(), page, size, result.getTotalElements());
        }));
    }
}
