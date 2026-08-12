package com.chitfund.reportingservice.repository;

import com.chitfund.reportingservice.domain.MonthlyCollectionSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MonthlyCollectionSnapshotRepository extends JpaRepository<MonthlyCollectionSnapshot, String> {

    Optional<MonthlyCollectionSnapshot> findByChitIdAndMonthNumber(String chitId, Integer monthNumber);

    List<MonthlyCollectionSnapshot> findByTenantIdAndChitIdOrderByMonthNumberAsc(String tenantId, String chitId);
}
