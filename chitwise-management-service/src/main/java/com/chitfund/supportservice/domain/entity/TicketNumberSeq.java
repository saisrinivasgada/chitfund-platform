package com.chitfund.supportservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "ticket_number_seq")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TicketNumberSeq {

    @Id
    @Column(name = "year")
    private int year;

    @Column(name = "last_val", nullable = false)
    private int lastVal;
}
