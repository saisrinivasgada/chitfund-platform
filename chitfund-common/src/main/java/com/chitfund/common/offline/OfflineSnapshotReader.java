package com.chitfund.common.offline;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Supplier;

/** Revision and rows share one repeatable-read view, including after a paused download. */
public final class OfflineSnapshotReader {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    public OfflineSnapshotReader(JdbcTemplate jdbc, PlatformTransactionManager manager) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(manager);
        transaction.setReadOnly(true);
        transaction.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }
    public Map<String, Object> read(String expected, Supplier<Map<String, Object>> rows) {
        String tenant = TenantContext.get();
        if (tenant == null || tenant.isBlank()) throw new BusinessException(ErrorCode.FORBIDDEN);
        return transaction.execute(status -> {
            var revisions = jdbc.queryForList("SELECT revision FROM offline_read_revisions WHERE tenant_id=?", Long.class, tenant);
            String version = LocalDate.now() + ":" + (revisions.isEmpty() ? 0L : revisions.get(0));
            if (expected != null && !version.equals(expected)) throw new BusinessException(
                    ErrorCode.CONCURRENT_MODIFICATION, "This list changed while downloading. Resume will restart only this list.", HttpStatus.CONFLICT);
            var result = new LinkedHashMap<>(rows.get());
            result.put("snapshotVersion", version);
            return result;
        });
    }
    public static Map<String, Object> page(java.util.List<?> content, int page, int size, long total) {
        return Map.of("content", content, "page", page, "size", size, "totalElements", total,
                "totalPages", (total + size - 1) / size, "last", (long)(page + 1) * size >= total,
                "hasMore", (long)(page + 1) * size < total);
    }
}
