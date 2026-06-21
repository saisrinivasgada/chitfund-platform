package com.chitfund.chitservice.repository;

import com.chitfund.chitservice.domain.entity.Chit;
import com.chitfund.chitservice.domain.enums.ChitStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface ChitRepository extends JpaRepository<Chit, UUID> {

    // Exclude soft-deleted chits from all list queries
    Page<Chit> findByDeletedAtIsNull(Pageable pageable);
    Page<Chit> findByStatusAndDeletedAtIsNull(ChitStatus status, Pageable pageable);
    Page<Chit> findByCreatedByAndDeletedAtIsNull(UUID createdBy, Pageable pageable);

    // Filter by a set of IDs — used for member-scoped chit lists
    List<Chit> findByIdInAndDeletedAtIsNull(Collection<UUID> ids);
    List<Chit> findByIdInAndStatusAndDeletedAtIsNull(Collection<UUID> ids, ChitStatus status);

    // Soft-deleted chits — admin audit view
    Page<Chit> findByDeletedAtIsNotNull(Pageable pageable);
}
