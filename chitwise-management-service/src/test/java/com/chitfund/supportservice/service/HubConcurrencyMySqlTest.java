package com.chitfund.supportservice.service;

import com.chitfund.supportservice.client.*;
import com.chitfund.supportservice.domain.entity.*;
import com.chitfund.supportservice.repository.*;
import com.chitfund.supportservice.websocket.TicketWebSocketController;
import jakarta.persistence.EntityManagerFactory;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.*;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.*;
import javax.sql.DataSource;
import java.time.Instant;
import java.time.Year;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.mock;

@Testcontainers(disabledWithoutDocker=true)
@SpringJUnitConfig(HubConcurrencyMySqlTest.Config.class)
class HubConcurrencyMySqlTest {
    @Container static final MySQLContainer<?> MYSQL=new MySQLContainer<>("mysql:8.0")
            .withCommand("--log-bin-trust-function-creators=1").withDatabaseName("chitwise_hub").withUsername("chitfund").withPassword("testpassword");
    @Autowired TicketNumberSeqRepository sequence;
    @Autowired EmployeeRepository employees;
    @Autowired ConversationRepository conversations;
    @Autowired ConversationMessageRepository messages;
    @Autowired PlatformTransactionManager manager;
    @Test void firstTicketsOfYearUseAtomicInitializationAndManagedIncrement() throws Exception {
        var service=new TicketService(mock(SupportTicketRepository.class),mock(TicketMessageRepository.class),
                mock(TicketAssignmentRepository.class),mock(TicketWebSocketController.class),sequence,
                mock(TenantSupportClient.class),mock(IdentityCaseService.class),mock(AuditClient.class));
        var pool=Executors.newFixedThreadPool(8);var start=new CountDownLatch(1);List<Future<String>> work=new ArrayList<>();
        try {
            for(int i=0;i<8;i++) work.add(pool.submit(()->{
                start.await();return new TransactionTemplate(manager).execute(status->service.generateTicketNumber());
            }));
            start.countDown();Set<String> numbers=new HashSet<>();for(var f:work)numbers.add(f.get(15,TimeUnit.SECONDS));
            assertThat(numbers).hasSize(8);
            for(int i=1;i<=8;i++)assertThat(numbers).contains(String.format("CW-%d-%04d",Year.now().getValue(),i));
            assertThat(sequence.findById(Year.now().getValue()).orElseThrow().getLastVal()).isEqualTo(8);
        } finally {pool.shutdownNow();}
    }
    @Test void loginTimestampCannotUndoConcurrentDeactivationOrSessionRevocation() throws Exception {
        String id=UUID.randomUUID().toString();var saved=employees.saveAndFlush(Employee.builder().id(id)
                .email(id+"@example.test").username(id).fullName("Concurrency QA").role("SUPPORT_AGENT").active(true).build());
        var tx=new TransactionTemplate(manager);var loaded=new CountDownLatch(1);var changed=new CountDownLatch(1);
        var pool=Executors.newSingleThreadExecutor();
        try {
            var login=pool.submit(()->{
                try {
                    tx.executeWithoutResult(status->{
                        var stale=employees.findById(id).orElseThrow();loaded.countDown();
                        try{assertThat(changed.await(5,TimeUnit.SECONDS)).isTrue();}catch(InterruptedException e){throw new RuntimeException(e);}
                        stale.setLastLoginAt(Instant.now());employees.saveAndFlush(stale);
                    });return (Throwable)null;
                }catch(Throwable failure){return failure;}
            });
            assertThat(loaded.await(5,TimeUnit.SECONDS)).isTrue();
            tx.executeWithoutResult(status->{var current=employees.findById(id).orElseThrow();current.setActive(false);current.setAuthVersion(1);employees.saveAndFlush(current);});
            changed.countDown();assertThat(login.get(10,TimeUnit.SECONDS)).isInstanceOf(org.springframework.orm.ObjectOptimisticLockingFailureException.class);
            var current=employees.findById(id).orElseThrow();assertThat(current.isActive()).isFalse();assertThat(current.getAuthVersion()).isEqualTo(1);
            assertThat(current.getVersion()).isEqualTo(saved.getVersion()+1);
        } finally {changed.countDown();pool.shutdownNow();}
    }
    @Test void simultaneousChatSendsCannotOverwriteAtomicUnreadCounters() throws Exception {
        String id=UUID.randomUUID().toString();String tenant=UUID.randomUUID().toString();
        conversations.saveAndFlush(Conversation.builder().id(id).tenantId(tenant).memberId("member-qa").memberName("QA member").build());
        var service=new ConversationService(conversations,messages,
                mock(com.chitfund.supportservice.websocket.ConversationWebSocketController.class),mock(AuditClient.class));
        var pool=Executors.newFixedThreadPool(2);var loaded=new CountDownLatch(2);List<Future<?>> work=new ArrayList<>();
        try {
            for(int i=0;i<2;i++) { final int n=i; work.add(pool.submit(()->new TransactionTemplate(manager).executeWithoutResult(status->{
                conversations.findById(id).orElseThrow();loaded.countDown();
                try{assertThat(loaded.await(5,TimeUnit.SECONDS)).isTrue();}catch(InterruptedException e){throw new RuntimeException(e);}
                var request=new com.chitfund.supportservice.dto.request.SendChatMessageRequest();
                request.setContent("Concurrent message "+n);request.setClientMessageId(UUID.randomUUID().toString());
                service.sendMessage(id,tenant,"admin-"+n,"QA Admin","ADMIN",false,request);
            }))); }
            for(var f:work)f.get(15,TimeUnit.SECONDS);
            var saved=conversations.findById(id).orElseThrow();assertThat(saved.getMemberUnread()).isEqualTo(2);assertThat(saved.getAdminUnread()).isZero();
        } finally {pool.shutdownNow();}
    }
    @Configuration @EnableTransactionManagement
    @EnableJpaRepositories(basePackageClasses=EmployeeRepository.class,
            excludeFilters=@ComponentScan.Filter(type=FilterType.REGEX,pattern=".*\\.repository\\.(?!EmployeeRepository$|TicketNumberSeqRepository$|ConversationRepository$|ConversationMessageRepository$).*"))
    static class Config {
        @Bean DataSource ds(){return new DriverManagerDataSource(MYSQL.getJdbcUrl(),MYSQL.getUsername(),MYSQL.getPassword());}
        @Bean Flyway flyway(DataSource ds){var f=Flyway.configure().dataSource(ds).locations("classpath:db/migration").load();f.migrate();return f;}
        @Bean @DependsOn("flyway") LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource ds){
            var f=new LocalContainerEntityManagerFactoryBean();f.setDataSource(ds);f.setPackagesToScan("com.chitfund.supportservice.domain.entity");f.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            f.setJpaPropertyMap(Map.of("hibernate.physical_naming_strategy","org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy"));return f;
        }
        @Bean PlatformTransactionManager transactionManager(EntityManagerFactory f){return new JpaTransactionManager(f);}
    }
}
