package com.chitfund.userservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "plan_capability_defs")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlanCapabilityDef {

    @Id
    @Column(name = "`key`", length = 80)
    private String key;

    @Column(name = "label", nullable = false, length = 120)
    private String label;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;
}
