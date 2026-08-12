package com.chitfund.reportingservice.repository;

import com.chitfund.reportingservice.domain.MemberPaymentSummary;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MemberPaymentSummaryRepository extends JpaRepository<MemberPaymentSummary, String> {

    Optional<MemberPaymentSummary> findByMemberIdAndChitId(String memberId, String chitId);

    List<MemberPaymentSummary> findByTenantIdAndChitIdOrderByMemberNameAsc(String tenantId, String chitId);

    List<MemberPaymentSummary> findByTenantIdAndMemberIdOrderByChitIdAsc(String tenantId, String memberId);
}
