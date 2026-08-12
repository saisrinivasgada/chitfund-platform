package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.Promotion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PromotionRepository extends JpaRepository<Promotion, UUID> {
    Optional<Promotion> findByCodeIgnoreCase(String code);
    List<Promotion> findAllByIsPublicTrueAndIsActiveTrue();
    Optional<Promotion> findFirstByPromoTypeAndIsActiveTrue(String promoType);
}
