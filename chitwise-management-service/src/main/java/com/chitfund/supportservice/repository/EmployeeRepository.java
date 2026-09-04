package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.Employee;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.Optional;

public interface EmployeeRepository extends JpaRepository<Employee, String> {
    Optional<Employee> findByUsername(String username);
    Optional<Employee> findByEmail(String email);
    Optional<Employee> findByInviteToken(String token);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT e FROM Employee e WHERE e.inviteToken = :token")
    Optional<Employee> findByInviteTokenForUpdate(@Param("token") String token);
    boolean existsByEmail(String email);
    boolean existsByUsername(String username);
}
