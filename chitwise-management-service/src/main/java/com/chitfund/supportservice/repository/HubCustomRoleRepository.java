package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.HubCustomRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface HubCustomRoleRepository extends JpaRepository<HubCustomRole, String> {
    boolean existsByNameIgnoreCase(String name);
    boolean existsByNameIgnoreCaseAndIdNot(String name, String id);

    @Query("SELECT COUNT(e) FROM Employee e WHERE e.customRoleId = :roleId")
    long countEmployeesWithRole(String roleId);
}
