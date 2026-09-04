package com.chitfund.memberservice.repository;

import com.chitfund.memberservice.domain.TeamNote;
import com.chitfund.memberservice.domain.enums.NoteVisibility;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface TeamNoteRepository extends JpaRepository<TeamNote, UUID> {

    // All notes visible to a given user:
    //   - own notes (any visibility)
    //   - OR shared notes from others (only if caller is ADMIN or MANAGER)
    @Query("""
        SELECT n FROM TeamNote n
        WHERE n.tenantId = :tenantId
          AND (n.authorId = :userId
           OR (n.visibility = :shared AND :role IN ('ADMIN', 'MANAGER')))
        ORDER BY n.createdAt DESC
        """)
    List<TeamNote> findVisibleTo(@Param("tenantId") String tenantId,
                                 @Param("userId") UUID userId,
                                 @Param("role") String role,
                                 @Param("shared") NoteVisibility shared);

    java.util.Optional<TeamNote> findByIdAndTenantId(UUID id, String tenantId);

    List<TeamNote> findByAuthorIdAndTenantIdOrderByCreatedAtDesc(UUID authorId, String tenantId);
}
