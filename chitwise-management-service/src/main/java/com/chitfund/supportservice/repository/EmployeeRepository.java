package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.Employee;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface EmployeeRepository extends JpaRepository<Employee, String> {
    Optional<Employee> findByUsername(String username);
    Optional<Employee> findByEmail(String email);
    Optional<Employee> findByInviteToken(String token);
    boolean existsByEmail(String email);
    boolean existsByUsername(String username);
}
