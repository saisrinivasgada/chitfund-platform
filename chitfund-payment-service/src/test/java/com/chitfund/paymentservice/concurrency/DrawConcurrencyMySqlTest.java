package com.chitfund.paymentservice.concurrency;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.paymentservice.client.*;
import com.chitfund.paymentservice.domain.*;
import com.chitfund.paymentservice.domain.enums.*;
import com.chitfund.paymentservice.dto.request.OpenMonthRequest;
import com.chitfund.paymentservice.kafka.*;
import com.chitfund.paymentservice.repository.*;
import com.chitfund.paymentservice.service.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManagerFactory;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
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
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@Testcontainers(disabledWithoutDocker = true)
@SpringJUnitConfig(DrawConcurrencyMySqlTest.Config.class)
class DrawConcurrencyMySqlTest {
    @Container static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withCommand("--log-bin-trust-function-creators=1").withDatabaseName("chitfund_payments")
            .withUsername("chitfund").withPassword("testpassword");
    @Autowired ChitMonthDrawService draws;
    @Autowired CoordinatedDrawSkipService coordinatedSkips;
    @Autowired PaymentService payments;
    @Autowired DrawReconciliationQueue queue;
    @Autowired FinancialCommandLock locks;
    @Autowired ChitMonthDrawRepository drawRows;
    @Autowired PaymentRecordRepository records;
    @Autowired ChitServiceClient chits;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired DataSource ds;
    @Autowired MemberCreditService credit;
    @Autowired PlanExpiryChecker plan;
    @Autowired MemberServiceClient members;
    final UUID admin = UUID.randomUUID();
    String tenant;
    UUID chitId, member;
    TransactionTemplate tx;
    @BeforeEach void setup() {
        tenant=UUID.randomUUID().toString(); chitId=UUID.randomUUID(); member=UUID.randomUUID(); TenantContext.set(tenant);
        tx=new TransactionTemplate(transactionManager);
        var chit=new ChitServiceClient.ChitDto(); chit.setId(chitId); chit.setStatus("ACTIVE");
        chit.setDurationMonths(1); chit.setInstallmentAmount(new BigDecimal("1000")); chit.setWinnerSelectionMode("LOTTERY");
        when(chits.getChit(chitId)).thenReturn(chit);
        var due=new ChitServiceClient.MemberAmountDto(); due.setMemberId(member); due.setAmountDue(new BigDecimal("1000"));
        when(chits.getDrawMemberAmounts(chitId)).thenReturn(List.of(due));
    }
    @AfterEach void clear() { TenantContext.clear(); }
    OpenMonthRequest request(int month) {
        var r=new OpenMonthRequest(); r.setChitId(chitId); r.setMonthNumber(month); r.setMaxCycles(1);
        r.setDueDate(LocalDate.now()); r.setInstallmentAmount(new BigDecimal("1000"));
        var amount=new OpenMonthRequest.MemberAmount(); amount.setMemberId(member); amount.setAmountDue(new BigDecimal("1000"));
        r.setMembers(List.of(amount)); return r;
    }
    List<Throwable> compete(Runnable a, Runnable b) throws Exception {
        var pool=Executors.newFixedThreadPool(2); var ready=new CountDownLatch(2); List<Future<Throwable>> work=new ArrayList<>();
        try {
            tx.executeWithoutResult(status -> {
                locks.lock(tenant,"draw-schedule:"+chitId);
                for(var action:List.of(a,b)) work.add(pool.submit(()->{
                    TenantContext.set(tenant); ready.countDown();
                    try { action.run(); return null; } catch(Throwable failure) {return failure;} finally {TenantContext.clear();}
                }));
                try { assertThat(ready.await(5,TimeUnit.SECONDS)).isTrue(); Thread.sleep(250); }
                catch(InterruptedException failure) {throw new RuntimeException(failure);}
                assertThat(work).allMatch(future->!future.isDone());
            });
            List<Throwable> results=new ArrayList<>(); for(var f:work) results.add(f.get(15,TimeUnit.SECONDS)); return results;
        } finally {pool.shutdownNow();}
    }
    @Test void simultaneousOpenRequestsCreateOneDrawAndOneSetOfInstallments() throws Exception {
        var results=compete(()->draws.openDraw(request(1),admin,"ADMIN"),()->draws.openDraw(request(1),admin,"MANAGER"));
        assertThat(results.stream().filter(Objects::isNull).count()).isEqualTo(1);
        assertThat(results.stream().filter(Objects::nonNull).toList()).singleElement().isInstanceOf(BusinessException.class);
        assertThat(drawRows.countByTenantIdAndChitIdAndStatusNot(tenant,chitId,DrawStatus.SKIPPED)).isEqualTo(1);
        assertThat(records.findByTenantIdAndChitIdAndMonthNumber(tenant,chitId,1)).hasSize(1);
        assertThat(auditCount("DRAW_OPENED")).isEqualTo(1);
    }
    @Test void differentOrdinalsCannotExceedRealCycleLimit() throws Exception {
        var results=compete(()->draws.openDraw(request(1),admin,"ADMIN"),()->draws.openDraw(request(2),admin,"MANAGER"));
        assertThat(results.stream().filter(Objects::isNull).count()).isEqualTo(1);
        assertThat(results.stream().filter(Objects::nonNull).toList()).singleElement().isInstanceOf(BusinessException.class);
        assertThat(drawRows.countByTenantIdAndChitIdAndStatusNot(tenant,chitId,DrawStatus.SKIPPED)).isEqualTo(1);
    }
    @Test void concurrentPaymentsReconcileAfterBothCommitAndReversalReopensExactlyOnce() throws Exception {
        draws.openDraw(request(1),admin,"ADMIN");
        var first=records.findByTenantIdAndChitIdAndMonthNumber(tenant,chitId,1).get(0);
        var second=records.saveAndFlush(PaymentRecord.builder().tenantId(tenant).chitId(chitId).memberId(UUID.randomUUID())
                .monthNumber(1).dueDate(LocalDate.now()).amountDue(new BigDecimal("1000")).amountPaid(BigDecimal.ZERO)
                .status(PaymentRecordStatus.OUTSTANDING).build());
        var pool=Executors.newFixedThreadPool(2); var updated=new CountDownLatch(2);
        try {
            List<Future<?>> writes=new ArrayList<>();
            for(var id:List.of(first.getId(),second.getId())) writes.add(pool.submit(()->{
                TenantContext.set(tenant);
                try { tx.executeWithoutResult(status->{
                    var record=records.findByIdAndTenantIdForUpdate(id,tenant).orElseThrow();
                    record.setAmountPaid(record.getAmountDue()); record.setStatus(PaymentRecordStatus.SETTLED); records.saveAndFlush(record);
                    updated.countDown();
                    try {assertThat(updated.await(5,TimeUnit.SECONDS)).isTrue();} catch(InterruptedException e){throw new RuntimeException(e);}
                    draws.autoCloseIfAllSettled(chitId,1);
                }); } finally {TenantContext.clear();}
            }));
            for(var f:writes) f.get(15,TimeUnit.SECONDS);
            var q1=pool.submit(()->queue.reconcile()); var q2=pool.submit(()->queue.reconcile()); q1.get(10,TimeUnit.SECONDS); q2.get(10,TimeUnit.SECONDS);
        } finally {pool.shutdownNow();}
        assertThat(drawRows.findByTenantIdAndChitIdAndMonthNumber(tenant,chitId,1).orElseThrow().getStatus()).isEqualTo(DrawStatus.CLOSED);
        assertThat(auditCount("DRAW_AUTO_CLOSED")).isEqualTo(1);
        tx.executeWithoutResult(status->{
            var record=records.findByIdAndTenantIdForUpdate(first.getId(),tenant).orElseThrow();
            record.setAmountPaid(BigDecimal.ZERO); record.setStatus(PaymentRecordStatus.OUTSTANDING); records.save(record);
            draws.autoReopenIfNotFullySettled(chitId,1);
        });
        queue.reconcile(); queue.reconcile();
        assertThat(drawRows.findByTenantIdAndChitIdAndMonthNumber(tenant,chitId,1).orElseThrow().getStatus()).isEqualTo(DrawStatus.OPEN);
        assertThat(auditCount("DRAW_AUTO_REOPENED")).isEqualTo(1);
    }
    @Test void rolledBackPaymentCannotLeaveReconciliationOrSuccessfulAudit() {
        draws.openDraw(request(1),admin,"ADMIN");
        tx.executeWithoutResult(status->{draws.autoCloseIfAllSettled(chitId,1); status.setRollbackOnly();});
        assertThat(new JdbcTemplate(ds).queryForObject("SELECT COUNT(*) FROM draw_reconciliation_queue WHERE tenant_id=?",Long.class,tenant)).isZero();
        queue.reconcile(); assertThat(auditCount("DRAW_AUTO_CLOSED")).isZero();
    }
    @Test void promisedDateChangePreservesCommittedFinancialFieldsAndIsAudited() {
        draws.openDraw(request(1),admin,"ADMIN");
        var record=records.findByTenantIdAndChitIdAndMonthNumber(tenant,chitId,1).get(0);
        tx.executeWithoutResult(status->{var r=records.findByIdAndTenantIdForUpdate(record.getId(),tenant).orElseThrow();
            r.setAmountPaid(new BigDecimal("600"));r.setStatus(PaymentRecordStatus.PARTIALLY_PAID);records.save(r);});
        payments.updatePromisedDate(record.getId(),LocalDate.now().plusDays(1));
        var saved=records.findById(record.getId()).orElseThrow();
        assertThat(saved.getAmountPaid()).isEqualByComparingTo("600"); assertThat(saved.getStatus()).isEqualTo(PaymentRecordStatus.PARTIALLY_PAID);
        assertThat(auditCount("PAYMENT_PROMISED_DATE_CHANGED")).isEqualTo(1);
    }
    @Test void openingCreditLeavesCollectibleDuesAndBothOfflineAllocationModesVoidExactly() {
        when(credit.getBalanceForUpdate(member)).thenReturn(new BigDecimal("500"),BigDecimal.ZERO);
        when(plan.assertRecordedPaymentMaySync(eq(admin),anyString(),any())).thenReturn("verified-grant");
        when(members.getMemberName(member)).thenReturn("Credit member");
        draws.openDraw(request(1),admin,"ADMIN");
        UUID recordId=records.findByTenantIdAndChitIdAndMonthNumber(tenant,chitId,1).get(0).getId();
        assertThat(records.findById(recordId).orElseThrow().getStatus()).isEqualTo(PaymentRecordStatus.PARTIAL_CREDIT);
        for (boolean explicit : List.of(false,true)) {
            var payment=new com.chitfund.paymentservice.dto.request.RecordPaymentRequest();
            payment.setChitId(chitId);payment.setMemberId(member);payment.setAmount(new BigDecimal("500"));
            payment.setPaymentMode(PaymentMode.CASH);payment.setOfflineAuthorization("proof");payment.setRecordedAt(java.time.Instant.now());
            if(explicit){var allocation=new com.chitfund.paymentservice.dto.request.RequestedChitAllocation();allocation.setChitId(chitId);allocation.setAmount(new BigDecimal("500"));payment.setAllocations(List.of(allocation));}
            assertThat(payments.getMemberTotalBalance(member)).isEqualByComparingTo("500");
            assertThat(payments.offlineBalanceSnapshot(payment,false).selectedOutstanding()).isEqualByComparingTo("500");
            var receipt=payments.recordPayment(payment,admin,"partial-credit-"+UUID.randomUUID());
            assertThat(records.findById(recordId).orElseThrow().getAmountPaid()).isEqualByComparingTo("1000");
            assertThat(records.findById(recordId).orElseThrow().getStatus()).isEqualTo(PaymentRecordStatus.SETTLED);
            assertThat(payments.getMemberTotalBalance(member)).isEqualByComparingTo("0");
            var reason=new com.chitfund.paymentservice.dto.request.VoidPaymentRequest();reason.setReason("Reverse test cash only");
            payments.voidPayment(receipt.getId(),reason,admin);
            assertThat(records.findById(recordId).orElseThrow().getAmountPaid()).isEqualByComparingTo("500");
            assertThat(payments.getMemberTotalBalance(member)).isEqualByComparingTo("500");
        }
        verify(credit,never()).addCredit(eq(member),any(),any(),any(),any(),anyString());
    }
    @Test void partialPayoutAllowsActualLaterCashAndReversalPreservesCreditAndCash() {
        when(credit.getBalanceForUpdate(member)).thenReturn(new BigDecimal("500"), BigDecimal.ZERO);
        when(members.getMemberName(member)).thenReturn("Credit member");
        draws.openDraw(request(1), admin, "ADMIN");
        UUID recordId = records.findByTenantIdAndChitIdAndMonthNumber(tenant, chitId, 1).get(0).getId();
        UUID payout = UUID.randomUUID();
        payments.markCrossChitDisbursementSettled(chitId, member, new BigDecimal("300"), payout, tenant);
        var payment = new com.chitfund.paymentservice.dto.request.RecordPaymentRequest();
        payment.setChitId(chitId); payment.setMemberId(member); payment.setAmount(new BigDecimal("150")); payment.setPaymentMode(PaymentMode.CASH);
        var receipt = payments.recordPayment(payment, admin, "cash-after-payout-" + UUID.randomUUID());
        assertThat(records.findById(recordId).orElseThrow().getAmountPaid()).isEqualByComparingTo("950");
        payments.revertPayoutDeductions(payout, tenant);
        assertThat(records.findById(recordId).orElseThrow().getAmountPaid()).isEqualByComparingTo("650");
        assertThat(payments.getMemberTotalBalance(member)).isEqualByComparingTo("350");
        var reason = new com.chitfund.paymentservice.dto.request.VoidPaymentRequest(); reason.setReason("Reverse cash after payout reversal");
        payments.voidPayment(receipt.getId(), reason, admin);
        assertThat(records.findById(recordId).orElseThrow().getAmountPaid()).isEqualByComparingTo("500");
        assertThat(payments.getMemberTotalBalance(member)).isEqualByComparingTo("500");
        verify(credit, never()).addCredit(eq(member), any(), any(), any(), any(), anyString());
    }
    @Test void coordinatedSkipReplaysTheSameReceiptAfterALostResponseWithoutDuplicateWaivers() {
        UUID commandId = UUID.randomUUID(); var request = new com.chitfund.common.dto.DrawSkipRequest();
        request.setChitId(chitId); request.setMonthNumber(1); request.setDueDate(LocalDate.now());
        request.setInstallmentAmount(new BigDecimal("1000")); request.setSkipReason("Holiday pause"); request.setMemberIds(List.of(member));
        var chit = chits.getChit(chitId); chit.setScheduleSyncCommandId(commandId);
        var command = new com.chitfund.common.dto.DrawSkipCommand(commandId, admin, "ADMIN", request);
        var first = draws.skipDrawCommand(command); var replay = draws.skipDrawCommand(command);
        assertThat(replay.getId()).isEqualTo(first.getId());
        assertThat(records.findByTenantIdAndChitIdAndMonthNumber(tenant, chitId, 1)).hasSize(1);
        assertThat(auditCount("DRAW_SKIPPED")).isEqualTo(1);
        request.setSkipReason("Changed details");
        assertThatThrownBy(() -> draws.skipDrawCommand(command)).isInstanceOf(BusinessException.class);
        assertThat(auditCount("DRAW_SKIPPED")).isEqualTo(1);
        assertThatThrownBy(() -> draws.openDraw(request(2), admin, "ADMIN")).isInstanceOf(BusinessException.class).hasMessageContaining("still syncing");
    }
    com.chitfund.common.dto.DrawSkipCommand coordinatedCommand(int month) {
        UUID id = UUID.randomUUID(); var request = new com.chitfund.common.dto.DrawSkipRequest();
        request.setChitId(chitId); request.setMonthNumber(month); request.setDueDate(LocalDate.now()); request.setInstallmentAmount(new BigDecimal("1000"));
        request.setSkipReason("Holiday pause"); request.setMemberIds(List.of(member));
        chits.getChit(chitId).setScheduleSyncCommandId(id);
        return new com.chitfund.common.dto.DrawSkipCommand(id, admin, "ADMIN", request);
    }
    @Test void existingDrawCreatesAStableNoEffectRejectionThatCannotBecomeASkipLater() {
        var open = draws.openDraw(request(1), admin, "ADMIN"); var command = coordinatedCommand(1);
        var result = coordinatedSkips.execute(command); assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(drawRows.findByTenantIdAndChitIdAndMonthNumber(tenant, chitId, 1).orElseThrow().getStatus()).isEqualTo(DrawStatus.OPEN);
        assertThat(records.findByTenantIdAndChitIdAndMonthNumber(tenant, chitId, 1)).singleElement().extracting(PaymentRecord::getStatus).isEqualTo(PaymentRecordStatus.OUTSTANDING);
        assertThat(auditCount("DRAW_SKIPPED")).isZero();
        assertThat(coordinatedSkips.execute(command)).isEqualTo(result);
    }
    @Test void appliedDecisionReplaysAfterResponseLossAndCannotBeReclassifiedAsRejected() {
        var command = coordinatedCommand(1); var result = coordinatedSkips.execute(command);
        assertThat(result.status()).isEqualTo("APPLIED"); assertThat(coordinatedSkips.execute(command)).isEqualTo(result);
        assertThat(auditCount("DRAW_SKIPPED")).isEqualTo(1);
        assertThat(records.findByTenantIdAndChitIdAndMonthNumber(tenant, chitId, 1)).hasSize(1);
        command.request().setSkipReason("Changed details");
        assertThatThrownBy(() -> coordinatedSkips.execute(command)).isInstanceOf(BusinessException.class).hasMessageContaining("details changed");
    }
    @Test void scheduleOnlyFenceNeverCreatesAWaivedDrawOrMemberObligation() {
        var original = coordinatedCommand(1);
        var command = new com.chitfund.common.dto.DrawSkipCommand(original.commandId(), admin, "ADMIN", original.request(), true);
        assertThat(coordinatedSkips.execute(command).status()).isEqualTo("APPLIED");
        assertThat(coordinatedSkips.execute(command).status()).isEqualTo("APPLIED");
        assertThat(drawRows.findByTenantIdAndChitIdOrderByMonthNumberAsc(tenant, chitId)).isEmpty();
        assertThat(records.findByTenantIdAndChitIdAndMonthNumber(tenant, chitId, 1)).isEmpty();
        assertThat(auditCount("DRAW_SKIPPED")).isZero();
        assertThatThrownBy(() -> coordinatedSkips.execute(original)).isInstanceOf(BusinessException.class).hasMessageContaining("details changed");
    }
    long auditCount(String action) {
        return new JdbcTemplate(ds).queryForObject("SELECT COUNT(*) FROM event_outbox WHERE tenant_id=? AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.action'))=?",Long.class,tenant,action);
    }
    @Configuration @EnableTransactionManagement
    @EnableJpaRepositories(basePackageClasses=ChitMonthDrawRepository.class)
    @Import({ChitMonthDrawService.class,DrawReconciliationQueue.class,FinancialCommandLock.class,AuditClient.class,PaymentOutboxStore.class,PaymentService.class,CoordinatedDrawSkipService.class})
    static class Config {
        @Bean DataSource dataSource(){return new DriverManagerDataSource(MYSQL.getJdbcUrl(),MYSQL.getUsername(),MYSQL.getPassword());}
        @Bean Flyway flyway(DataSource ds){var f=Flyway.configure().dataSource(ds).locations("classpath:db/migration").load();f.migrate();return f;}
        @Bean JdbcTemplate jdbc(DataSource ds){return new JdbcTemplate(ds);}
        @Bean @DependsOn("flyway") LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource ds){
            var f=new LocalContainerEntityManagerFactoryBean();f.setDataSource(ds);f.setPackagesToScan("com.chitfund.paymentservice.domain");
            f.setJpaVendorAdapter(new HibernateJpaVendorAdapter());f.setJpaPropertyMap(Map.of("hibernate.type.preferred_uuid_jdbc_type","VARCHAR","hibernate.physical_naming_strategy","org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy"));return f;
        }
        @Bean PlatformTransactionManager transactionManager(EntityManagerFactory f){return new JpaTransactionManager(f);}
        @Bean ObjectMapper json(){return new ObjectMapper().findAndRegisterModules();}
        @Bean PlanExpiryChecker plan(){return mock(PlanExpiryChecker.class);}
        @Bean MemberCreditService credit(){var c=mock(MemberCreditService.class);when(c.getBalanceForUpdate(any())).thenReturn(BigDecimal.ZERO);when(c.getBalance(any())).thenReturn(BigDecimal.ZERO);return c;}
        @Bean ChitServiceClient chits(){return mock(ChitServiceClient.class);}
        @Bean PayoutServiceClient payouts(){return mock(PayoutServiceClient.class);}
        @Bean PaymentEventPublisher events(){return mock(PaymentEventPublisher.class);}
        @Bean AdminWalletService wallet(){return mock(AdminWalletService.class);}
        @Bean NotificationService notifications(){return mock(NotificationService.class);}
        @Bean MemberServiceClient members(){return mock(MemberServiceClient.class);}
        @Bean OfflinePaymentReviewCapture reviews(){return mock(OfflinePaymentReviewCapture.class);}
    }
}
