package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.HubCustomRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface HubCustomRoleRepository extends JpaRepository<HubCustomRole, String> {

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("SELECT r FROM HubCustomRole r WHERE r.id=:id")
    java.util.Optional<HubCustomRole> findByIdForUpdate(@org.springframework.data.repository.query.Param("id") String id);
    boolean existsByNameIgnoreCase(String name);
    boolean existsByNameIgnoreCaseAndIdNot(String name, String id);

    @Query("SELECT COUNT(e) FROM Employee e WHERE e.customRoleId = :roleId")
    long countEmployeesWithRole(String roleId);
}
