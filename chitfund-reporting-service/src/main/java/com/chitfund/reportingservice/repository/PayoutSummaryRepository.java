package com.chitfund.reportingservice.repository;

import com.chitfund.reportingservice.domain.PayoutSummary;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PayoutSummaryRepository extends JpaRepository<PayoutSummary, String> {

    Optional<PayoutSummary> findByChitIdAndMonthNumber(String chitId, Integer monthNumber);

    List<PayoutSummary> findByTenantIdAndChitIdOrderByMonthNumberAsc(String tenantId, String chitId);

    List<PayoutSummary> findByTenantIdAndMemberIdOrderByChitIdAsc(String tenantId, String memberId);
}
