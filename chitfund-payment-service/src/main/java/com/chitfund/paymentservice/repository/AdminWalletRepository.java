package com.chitfund.paymentservice.repository;

import com.chitfund.paymentservice.domain.AdminWalletEntry;
import com.chitfund.paymentservice.domain.enums.AccountType;
import com.chitfund.paymentservice.domain.enums.WalletEntryType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public interface AdminWalletRepository extends JpaRepository<AdminWalletEntry, UUID> {

    List<AdminWalletEntry> findByTenantIdOrderByCreatedAtDesc(String tenantId);
    Page<AdminWalletEntry> findByTenantIdOrderByCreatedAtDesc(String tenantId, Pageable pageable);

    @Query("SELECT COALESCE(SUM(e.amount), 0) FROM AdminWalletEntry e WHERE e.tenantId = :tenantId AND e.accountType = :accountType AND e.entryType = :entryType")
    BigDecimal sumByTenantAndAccountTypeAndEntryType(@Param("tenantId") String tenantId,
                                                      @Param("accountType") AccountType accountType,
                                                      @Param("entryType") WalletEntryType entryType);
}
