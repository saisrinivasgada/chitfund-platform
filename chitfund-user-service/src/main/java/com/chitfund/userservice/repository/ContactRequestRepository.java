package com.chitfund.userservice.repository;

import com.chitfund.userservice.domain.entity.ContactRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface ContactRequestRepository extends JpaRepository<ContactRequest, UUID> {
    List<ContactRequest> findAllByOrderByCreatedAtDesc();
    long countByStatus(String status);

    @Query("SELECT c FROM ContactRequest c WHERE " +
           "(:type IS NULL OR c.type = :type) AND " +
           "(:status IS NULL OR c.status = :status) AND " +
           "(:from IS NULL OR c.createdAt >= :from) AND " +
           "(:to IS NULL OR c.createdAt <= :to)")
    Page<ContactRequest> search(@Param("type") String type,
                                 @Param("status") String status,
                                 @Param("from") LocalDateTime from,
                                 @Param("to") LocalDateTime to,
                                 Pageable pageable);
}
