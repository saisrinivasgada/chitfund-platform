package com.chitfund.reportingservice.repository;

import com.chitfund.reportingservice.domain.MonthlyCollectionSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MonthlyCollectionSnapshotRepository extends JpaRepository<MonthlyCollectionSnapshot, String> {

    // Used by Kafka ingest consumer (no tenant context available)
    Optional<MonthlyCollectionSnapshot> findByChitIdAndMonthNumber(String chitId, Integer monthNumber);

    // Used by admin query endpoints (tenant-scoped)
    Optional<MonthlyCollectionSnapshot> findByTenantIdAndChitIdAndMonthNumber(String tenantId, String chitId, Integer monthNumber);

    List<MonthlyCollectionSnapshot> findByTenantIdAndChitIdOrderByMonthNumberAsc(String tenantId, String chitId);
}
