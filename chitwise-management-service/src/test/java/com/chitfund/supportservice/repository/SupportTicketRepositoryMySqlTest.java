package com.chitfund.supportservice.repository;

import com.chitfund.supportservice.domain.entity.SupportTicket;
import com.chitfund.supportservice.domain.enums.TicketPriority;
import com.chitfund.supportservice.domain.enums.TicketSource;
import com.chitfund.supportservice.domain.enums.TicketType;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class SupportTicketRepositoryMySqlTest {
    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("chitwise_management")
            .withUsername("test")
            .withPassword("test");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        // Production uses Flyway as the schema authority and ddl-auto=none.
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "none");
        registry.add("spring.flyway.enabled", () -> "true");
    }

    @Autowired SupportTicketRepository repository;

    @Test
    void hubSearchRestrictsRowsToAllowedTicketTypes() {
        repository.save(ticket("payment-ticket", "CW-2026-9001", TicketType.PAYMENT));
        repository.save(ticket("account-ticket", "CW-2026-9002", TicketType.ACCOUNT));
        repository.flush();

        var result = repository.searchForHub(
                null, null, false, Set.of(TicketType.PAYMENT), null,
                null, null, null, PageRequest.of(0, 20));

        assertThat(result.getContent())
                .extracting(SupportTicket::getId)
                .containsExactly("payment-ticket");
    }

    private SupportTicket ticket(String id, String number, TicketType type) {
        return SupportTicket.builder()
                .id(id)
                .ticketNumber(number)
                .type(type)
                .source(TicketSource.ORGANIZATION)
                .tenantId("tenant-1")
                .subject(type + " support")
                .priority(TicketPriority.NORMAL)
                .build();
    }
}
