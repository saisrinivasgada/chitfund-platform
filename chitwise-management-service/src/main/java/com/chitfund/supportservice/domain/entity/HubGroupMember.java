package com.chitfund.supportservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "hub_group_members")
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HubGroupMember {

    @Id
    private String id;

    @Column(name = "group_id", nullable = false)
    private String groupId;

    @Column(name = "employee_id", nullable = false)
    private String employeeId;

    @Column(name = "employee_name", nullable = false)
    private String employeeName;

    @Column(name = "joined_at", nullable = false)
    private Instant joinedAt;

    @PrePersist
    void onCreate() { if (joinedAt == null) joinedAt = Instant.now(); }
}
