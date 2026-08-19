package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.TrustedDevice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

public interface TrustedDeviceRepository extends JpaRepository<TrustedDevice, UUID> {

    Optional<TrustedDevice> findByTokenHash(String tokenHash);

    @Modifying
    @Transactional
    @Query("DELETE FROM TrustedDevice td WHERE td.userId = :userId")
    void deleteByUserId(UUID userId);
}
