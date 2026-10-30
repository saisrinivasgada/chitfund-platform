package com.chitfund.notificationservice.kafka;

import com.chitfund.common.event.PaymentCompletedEvent;
import com.chitfund.common.event.PaymentIntimationNotificationEvent;
import com.chitfund.common.event.SqsEventEnvelope;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.notificationservice.client.ChitServiceClient;
import com.chitfund.notificationservice.client.MemberServiceClient;
import com.chitfund.notificationservice.client.UserServiceClient;
import com.chitfund.notificationservice.domain.EventInbox;
import com.chitfund.notificationservice.domain.InAppNotification;
import com.chitfund.notificationservice.outbox.NotificationDeliveryQueue;
import com.chitfund.notificationservice.repository.EventInboxRepository;
import com.chitfund.notificationservice.repository.InAppNotificationRepository;
import com.chitfund.notificationservice.service.InAppNotificationService;
import com.chitfund.notificationservice.service.NotificationService;
import com.chitfund.notificationservice.websocket.WebSocketBroadcaster;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManagerFactory;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Integration tests for the payment approval → member notification pipeline.
 *
 * These tests wire NotificationEventConsumer with a real MySQL 8 database so that
 * EventInboxRepository and InAppNotificationRepository hit actual InnoDB tables.
 * External dependencies (MemberServiceClient, push queue, WebSocket broadcaster)
 * are mocked to keep the test scope focused on the notification side of the pipeline.
 *
 * The payment side is covered separately by PaymentIntimationOutboxMySqlTest in
 * chitfund-payment-service: approveIntimation → recordPayment → outbox row.
 * Together the two test classes cover the full pipeline at the DB level.
 */
@Testcontainers(disabledWithoutDocker = true)
@SpringJUnitConfig(PaymentApprovalNotificationPipelineMySqlTest.Config.class)
class PaymentApprovalNotificationPipelineMySqlTest {

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("chitfund_notifications")
            .withUsername("chitfund")
            .withPassword("testpassword");

    @Autowired NotificationEventConsumer consumer;
    @Autowired InAppNotificationRepository inAppRepo;
    @Autowired EventInboxRepository inboxRepo;
    @Autowired MemberServiceClient memberServiceClient;
    @Autowired PlatformTransactionManager txManager;
    @Autowired ObjectMapper mapper;

    String tenantA;
    String memberId;
    String userId;

    @BeforeEach
    void setUp() {
        tenantA  = "tenant-" + UUID.randomUUID();
        memberId = UUID.randomUUID().toString();
        userId   = UUID.randomUUID().toString();
        reset(memberServiceClient);
        when(memberServiceClient.getUserId(eq(tenantA), eq(memberId))).thenReturn(userId);
    }

    @AfterEach
    void tearDown() {
        new TransactionTemplate(txManager).executeWithoutResult(status -> {
            inAppRepo.deleteAll();
            inboxRepo.deleteAll();
        });
    }

    // ── Scenario 1: approval event creates exactly one inbox claim and one in-app ──

    @Test
    void approvalEventCreatesExactlyOneInboxClaimAndOneInAppNotification() throws Exception {
        String eventId = UUID.randomUUID().toString();
        String chitId  = UUID.randomUUID().toString();

        new TransactionTemplate(txManager).executeWithoutResult(status ->
                deliverPaymentCompleted(eventId, chitId, memberId, tenantA,
                        "INTIM:" + UUID.randomUUID()));

        assertThat(inboxRepo.findById(eventId)).isPresent();
        List<InAppNotification> notifications = inAppRepo.findAll().stream()
                .filter(n -> tenantA.equals(n.getTenantId()))
                .filter(n -> userId.equals(n.getRecipientId().toString()))
                .toList();
        assertThat(notifications).hasSize(1);
        assertThat(notifications.get(0).getTitle()).isEqualTo("Payment Received");
        assertThat(notifications.get(0).getType()).isEqualTo("PAYMENT_RECEIVED");
    }

    // ── Scenario 2: duplicate SQS delivery does not produce a second notification ──

    @Test
    void duplicateSqsDeliveryDoesNotCreateSecondNotification() throws Exception {
        String eventId = UUID.randomUUID().toString();
        String chitId  = UUID.randomUUID().toString();

        new TransactionTemplate(txManager).executeWithoutResult(status ->
                deliverPaymentCompleted(eventId, chitId, memberId, tenantA, null));

        // Re-deliver the same message (SQS at-least-once)
        new TransactionTemplate(txManager).executeWithoutResult(status ->
                deliverPaymentCompleted(eventId, chitId, memberId, tenantA, null));

        long count = inAppRepo.findAll().stream()
                .filter(n -> tenantA.equals(n.getTenantId()))
                .filter(n -> userId.equals(n.getRecipientId().toString()))
                .count();
        assertThat(count).isEqualTo(1);
    }

    // ── Scenario 3: notification-write failure rolls back the real inbox claim ──

    @Test
    void notificationWriteFailureRollsBackInboxClaimSoRetryCanSucceed() throws Exception {
        String eventId = UUID.randomUUID().toString();
        String chitId  = UUID.randomUUID().toString();
        InAppNotificationRepository failingRepo = mock(InAppNotificationRepository.class);
        when(failingRepo.save(any())).thenThrow(new RuntimeException("DB down"));

        // First delivery — in-app write fails → whole transaction rolls back
        assertThatThrownBy(() ->
                new TransactionTemplate(txManager).executeWithoutResult(status ->
                        deliverWithRepo(eventId, chitId, memberId, tenantA, null, failingRepo)))
                .isInstanceOf(Exception.class);

        // Inbox claim must have been rolled back — event_id should not be present
        assertThat(inboxRepo.findById(eventId)).isEmpty();

        // Retry with a working repo must succeed and create exactly one notification
        new TransactionTemplate(txManager).executeWithoutResult(status ->
                deliverPaymentCompleted(eventId, chitId, memberId, tenantA, null));

        assertThat(inboxRepo.findById(eventId)).isPresent();
        assertThat(inAppRepo.findAll().stream()
                .filter(n -> tenantA.equals(n.getTenantId())).count()).isEqualTo(1);
    }

    // ── Scenario 4: missing user account does not throw or claim an unreachable user ──

    @Test
    void missingUserAccountDoesNotFailTheFinancialEventProcessing() throws Exception {
        String eventId = UUID.randomUUID().toString();
        String memberWithoutApp = UUID.randomUUID().toString();
        when(memberServiceClient.getUserId(any(), eq(memberWithoutApp))).thenReturn(null);

        new TransactionTemplate(txManager).executeWithoutResult(status ->
                deliverPaymentCompleted(eventId, UUID.randomUUID().toString(),
                        memberWithoutApp, tenantA, null));

        // Inbox was claimed (financial event was processed) but no in-app was created
        assertThat(inboxRepo.findById(eventId)).isPresent();
        assertThat(inAppRepo.findAll().stream()
                .filter(n -> tenantA.equals(n.getTenantId())).count()).isZero();
    }

    // ── Scenario 5: rejection produces exactly one rejection notification ──

    @Test
    void rejectionProducesExactlyOneRejectionNotification() throws Exception {
        String eventId     = UUID.randomUUID().toString();
        String intimationId = UUID.randomUUID().toString();
        when(memberServiceClient.getUserId(eq(tenantA), eq(memberId))).thenReturn(userId);

        new TransactionTemplate(txManager).executeWithoutResult(status -> {
            try {
                PaymentIntimationNotificationEvent event = new PaymentIntimationNotificationEvent(
                        intimationId, memberId, null, new BigDecimal("500.00"),
                        "REJECTED", "UTR not found", tenantA);
                consumer.onEvent(mapper.writeValueAsString(
                        new SqsEventEnvelope(eventId, SqsQueues.EVT_PAYMENT_INTIMATION,
                                mapper.writeValueAsString(event))));
            } catch (Exception e) { throw new RuntimeException(e); }
        });

        assertThat(inboxRepo.findById(eventId)).isPresent();
        List<InAppNotification> notifications = inAppRepo.findAll().stream()
                .filter(n -> tenantA.equals(n.getTenantId()))
                .filter(n -> userId.equals(n.getRecipientId().toString()))
                .toList();
        assertThat(notifications).hasSize(1);
        assertThat(notifications.get(0).getType()).isEqualTo("PAYMENT_INTIMATION_REJECTED");
    }

    // ── Scenario 6: tenant A event cannot create a notification for tenant B's member ──

    @Test
    void tenantAEventCannotCreateNotificationForTenantBMember() throws Exception {
        String tenantB    = "tenant-" + UUID.randomUUID();
        String eventId    = UUID.randomUUID().toString();
        String chitId     = UUID.randomUUID().toString();
        String tenantBUserId = UUID.randomUUID().toString();
        when(memberServiceClient.getUserId(eq(tenantB), any())).thenReturn(tenantBUserId);

        new TransactionTemplate(txManager).executeWithoutResult(status ->
                deliverPaymentCompleted(eventId, chitId, memberId, tenantA, null));

        // tenant-b user must receive nothing — the event was for tenant-a
        assertThat(inAppRepo.findAll().stream()
                .filter(n -> tenantB.equals(n.getTenantId())).count()).isZero();
        // tenant-a user gets the notification
        assertThat(inAppRepo.findAll().stream()
                .filter(n -> tenantA.equals(n.getTenantId())).count()).isEqualTo(1);
    }

    // ── Scenario 7: rolled-back payment transaction leaves no successful notification ──

    @Test
    void rolledBackPaymentTransactionLeavesNoNotification() {
        String eventId = UUID.randomUUID().toString();
        String chitId  = UUID.randomUUID().toString();

        // Simulate the consumer being called inside a transaction that rolls back
        assertThatThrownBy(() ->
                new TransactionTemplate(txManager).executeWithoutResult(status -> {
                    deliverPaymentCompleted(eventId, chitId, memberId, tenantA, null);
                    status.setRollbackOnly(); // force rollback after the consumer runs
                }))
                .isInstanceOf(Exception.class);

        assertThat(inboxRepo.findById(eventId)).isEmpty();
        assertThat(inAppRepo.findAll().stream()
                .filter(n -> tenantA.equals(n.getTenantId())).count()).isZero();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────

    private void deliverPaymentCompleted(String eventId, String chitId, String member,
                                         String tenant, String idempotencyKey) {
        deliverWithRepo(eventId, chitId, member, tenant, idempotencyKey, inAppRepo);
    }

    private void deliverWithRepo(String eventId, String chitId, String member,
                                  String tenant, String idempotencyKey,
                                  InAppNotificationRepository repo) {
        try {
            PaymentCompletedEvent event = new PaymentCompletedEvent(
                    UUID.randomUUID().toString(), chitId, member,
                    new BigDecimal("1000.00"), "UPI",
                    new BigDecimal("2000.00"), new BigDecimal("1000.00"), new BigDecimal("1000.00"),
                    1, 0, 1, 0, LocalDate.now(), UUID.randomUUID().toString(), Instant.now(),
                    idempotencyKey, "API", Instant.now(), tenant, "ADMIN");
            consumerWithRepo(repo).onEvent(mapper.writeValueAsString(
                    new SqsEventEnvelope(eventId, SqsQueues.EVT_PAYMENT_COMPLETED,
                            mapper.writeValueAsString(event))));
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    private NotificationEventConsumer consumerWithRepo(InAppNotificationRepository repo) {
        return new NotificationEventConsumer(
                mock(NotificationService.class),
                new InAppNotificationService(repo, mapper),
                mock(NotificationDeliveryQueue.class),
                mapper,
                mock(WebSocketBroadcaster.class),
                memberServiceClient,
                mock(UserServiceClient.class),
                mock(ChitServiceClient.class),
                inboxRepo);
    }

    @Configuration
    @EnableTransactionManagement
    @EnableJpaRepositories(basePackageClasses = EventInboxRepository.class)
    @Import({InAppNotificationService.class})
    static class Config {
        @Bean
        DataSource dataSource() {
            return new DriverManagerDataSource(
                    MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword());
        }

        @Bean
        Flyway flyway(DataSource ds) {
            Flyway f = Flyway.configure().dataSource(ds)
                    .locations("classpath:db/migration").load();
            f.migrate();
            return f;
        }

        @Bean
        JdbcTemplate jdbc(DataSource ds) { return new JdbcTemplate(ds); }

        @Bean
        @DependsOn("flyway")
        LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource ds) {
            LocalContainerEntityManagerFactoryBean f = new LocalContainerEntityManagerFactoryBean();
            f.setDataSource(ds);
            f.setPackagesToScan("com.chitfund.notificationservice.domain");
            f.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            f.setJpaPropertyMap(Map.of(
                    "hibernate.type.preferred_uuid_jdbc_type", "VARCHAR",
                    "hibernate.physical_naming_strategy",
                    "org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy"));
            return f;
        }

        @Bean
        PlatformTransactionManager transactionManager(EntityManagerFactory f) {
            return new JpaTransactionManager(f);
        }

        @Bean
        ObjectMapper objectMapper() { return new ObjectMapper().findAndRegisterModules(); }

        @Bean
        MemberServiceClient memberServiceClient() { return mock(MemberServiceClient.class); }
    }
}
