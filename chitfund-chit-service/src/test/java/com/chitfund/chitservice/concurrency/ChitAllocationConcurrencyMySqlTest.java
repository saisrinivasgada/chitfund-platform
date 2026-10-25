package com.chitfund.chitservice.concurrency;

import com.chitfund.chitservice.client.*;
import com.chitfund.chitservice.controller.ReservationController;
import com.chitfund.chitservice.domain.entity.*;
import com.chitfund.chitservice.domain.enums.*;
import com.chitfund.chitservice.dto.request.*;
import com.chitfund.chitservice.mapper.*;
import com.chitfund.chitservice.repository.*;
import com.chitfund.chitservice.service.*;
import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.outbox.DurableAuditOutbox;
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
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
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
import static org.mockito.Mockito.mock;

/** Real InnoDB, real repositories, transactional service proxies and durable audit writes. */
@Testcontainers(disabledWithoutDocker = true)
@SpringJUnitConfig(ChitAllocationConcurrencyMySqlTest.Config.class)
class ChitAllocationConcurrencyMySqlTest {
    @Container static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.0")
            .withCommand("--log-bin-trust-function-creators=1").withDatabaseName("chitfund_chits")
            .withUsername("chitfund").withPassword("testpassword");
    @Autowired InvitationService invitations;
    @Autowired EnrollmentService enrollments;
    @Autowired ReservationController schedule;
    @Autowired ChitService chits;
    @Autowired DrawSkipCoordinator skips;
    @Autowired ChitLifecycleCommandStore lifecycle;
    @Autowired ChitLifecycleCommandRepository commands;
    @Autowired ChitRepository chitRows;
    @Autowired ChitInvitationRepository invitationRows;
    @Autowired InvitationResponseRepository responseRows;
    @Autowired MonthReservationRepository slots;
    @Autowired ChitEnrollmentRepository enrollmentRows;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired DataSource dataSource;
    final UUID admin = UUID.randomUUID();
    String tenant;
    Chit chit;
    ChitInvitation invitation;
    @BeforeEach void setup() {
        tenant = UUID.randomUUID().toString(); TenantContext.set(tenant);
        SecurityContextHolder.getContext().setAuthentication(auth());
        chit = chitRows.saveAndFlush(Chit.builder().tenantId(tenant).name("Concurrent allocation")
                .chitType(ChitType.RESERVATION).winnerSelectionMode(WinnerSelectionMode.RESERVATION)
                .capacity(1).durationMonths(1).chitValue(new BigDecimal("1000"))
                .installmentAmount(new BigDecimal("1000")).totalAmount(new BigDecimal("1000"))
                .startDate(LocalDate.now()).createdBy(admin).build());
        invitation = invitationRows.saveAndFlush(ChitInvitation.builder().chit(chit).tenantId(tenant).createdBy(admin).build());
    }
    @AfterEach void clear() { TenantContext.clear(); SecurityContextHolder.clearContext(); }
    UsernamePasswordAuthenticationToken auth() {
        return new UsernamePasswordAuthenticationToken(admin, null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
    }
    InvitationResponse interested(int draw) {
        return responseRows.saveAndFlush(InvitationResponse.builder().invitation(invitation)
                .memberId(UUID.randomUUID()).responseStatus(ResponseStatus.INTERESTED)
                .spotsRequested(1).requestedDrawNumbers("[" + draw + "]").build());
    }
    MonthReservation freeSlot(int draw) {
        return slots.saveAndFlush(MonthReservation.builder().chit(chit).monthNumber(draw)
                .reservationMonth(LocalDate.now().withDayOfMonth(1)).status(ReservationStatus.UNALLOCATED).createdBy(admin).build());
    }
    long auditCount(String action) {
        return new JdbcTemplate(dataSource).queryForObject(
                "SELECT COUNT(*) FROM audit_event_outbox WHERE tenant_id=? AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.action'))=?",
                Long.class, tenant, action);
    }
    // Hold the aggregate row first so both real transactions are running and waiting on it.
    List<Throwable> race(Runnable one, Runnable two) throws Exception {
        var pool = Executors.newFixedThreadPool(2); var ready = new CountDownLatch(2);
        var tx = new TransactionTemplate(transactionManager);
        List<Future<Throwable>> work = new ArrayList<>();
        try {
            tx.executeWithoutResult(status -> {
                chits.findByIdForUpdate(chit.getId());
                for (Runnable action : List.of(one, two)) {
                    work.add(pool.submit(() -> {
                        TenantContext.set(tenant); SecurityContextHolder.getContext().setAuthentication(auth());
                        ready.countDown();
                        try { action.run(); return null; }
                        catch (Throwable failure) { return failure; }
                        finally { TenantContext.clear(); SecurityContextHolder.clearContext(); }
                    }));
                }
                try { assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue(); Thread.sleep(250); }
                catch (InterruptedException failure) { throw new RuntimeException(failure); }
                assertThat(work).allMatch(future -> !future.isDone());
            });
            List<Throwable> results = new ArrayList<>();
            for (var future : work) results.add(future.get(15, TimeUnit.SECONDS));
            return results;
        } finally { pool.shutdownNow(); }
    }
    void oneSucceeds(List<Throwable> results) {
        assertThat(results.stream().filter(Objects::isNull).count()).isEqualTo(1);
        assertThat(results.stream().filter(Objects::nonNull).toList()).singleElement().isInstanceOf(BusinessException.class);
    }
    @Test void twoInvitationApprovalsCannotAllocateOneFreeSlotTwice() throws Exception {
        var slot = freeSlot(1); var a = interested(1); var b = interested(1);
        oneSucceeds(race(() -> invitations.approveResponse(chit.getId(), invitation.getId(), a.getId(), admin),
                () -> invitations.approveResponse(chit.getId(), invitation.getId(), b.getId(), admin)));
        var approved = responseRows.findByInvitationId(invitation.getId()).stream().filter(InvitationResponse::isApproved).toList();
        assertThat(approved).hasSize(1);
        assertThat(slots.findById(slot.getId()).orElseThrow().getMemberId()).isEqualTo(approved.get(0).getMemberId());
        assertThat(auditCount("ENROLLMENT_FROM_INVITATION")).isEqualTo(1);
        assertThat(auditCount("SLOT_ALLOCATED_FROM_INVITATION")).isEqualTo(1);
    }
    @Test void invitationAndDirectEnrollmentCompeteForSameLastSpot() throws Exception {
        chit.setChitType(ChitType.LOTTERY); chit.setWinnerSelectionMode(WinnerSelectionMode.LOTTERY); chitRows.saveAndFlush(chit);
        var response = interested(1); var request = new EnrollMemberRequest(); request.setMemberId(UUID.randomUUID());
        oneSucceeds(race(() -> invitations.approveResponse(chit.getId(), invitation.getId(), response.getId(), admin),
                () -> enrollments.enrollMember(chit.getId(), request)));
        assertThat(enrollmentRows.countByChitIdAndActiveTrue(chit.getId())).isEqualTo(1);
        assertThat(auditCount("ENROLLMENT_FROM_INVITATION") + auditCount("ENROLLMENT_ADDED")).isEqualTo(1);
    }
    @Test void scheduleEditsFromSameDisplayedVersionHaveOneWinner() throws Exception {
        var slot = freeSlot(1);
        var a = edit(slot, UUID.randomUUID()); var b = edit(slot, UUID.randomUUID());
        oneSucceeds(race(() -> schedule.updateSlot(chit.getId(), slot.getId(), a, auth()),
                () -> schedule.updateSlot(chit.getId(), slot.getId(), b, auth())));
        assertThat(auditCount("SLOT_UPDATED")).isEqualTo(1);
        assertThat(slots.findById(slot.getId()).orElseThrow().getVersion()).isEqualTo(slot.getVersion() + 1);
    }
    @Test void invitationApprovalAndManualAllocationCannotBothTakeOneSlot() throws Exception {
        var slot = freeSlot(1); var response = interested(1); var request = edit(slot, UUID.randomUUID());
        oneSucceeds(race(() -> invitations.approveResponse(chit.getId(), invitation.getId(), response.getId(), admin),
                () -> schedule.updateSlot(chit.getId(), slot.getId(), request, auth())));
        assertThat(auditCount("ENROLLMENT_FROM_INVITATION") + auditCount("SLOT_UPDATED")).isEqualTo(1);
        assertThat(slots.findById(slot.getId()).orElseThrow().getStatus()).isEqualTo(ReservationStatus.RESERVED);
    }
    @Test void repeatedApprovalOfOneResponseCannotCreateAnotherAllocation() throws Exception {
        freeSlot(1); var response = interested(1);
        oneSucceeds(race(() -> invitations.approveResponse(chit.getId(), invitation.getId(), response.getId(), admin),
                () -> invitations.approveResponse(chit.getId(), invitation.getId(), response.getId(), admin)));
        assertThat(auditCount("ENROLLMENT_FROM_INVITATION")).isEqualTo(1);
        assertThat(auditCount("SLOT_ALLOCATED_FROM_INVITATION")).isEqualTo(1);
    }

    @Test void missingVersionFailsClosedRatherThanOverwritingAnotherAllocation() {
        var slot = freeSlot(1); var request = edit(slot, UUID.randomUUID()); request.setExpectedVersion(null);
        assertThatThrownBy(() -> schedule.updateSlot(chit.getId(), slot.getId(), request, auth())).isInstanceOf(BusinessException.class);
        assertThat(slots.findById(slot.getId()).orElseThrow().getMemberId()).isNull();
        assertThat(auditCount("SLOT_UPDATED")).isZero();
    }
    @Test void scheduleAuditPreservesOrgOwnershipAndProcessingBeforeAfter() throws Exception {
        var a = freeSlot(1); var b = freeSlot(2); var member = UUID.randomUUID();
        a.setMemberId(member); a.setStatus(ReservationStatus.RESERVED);
        b.setOrgHeld(true); b.setStatus(ReservationStatus.RESERVED);
        slots.saveAndFlush(a); slots.saveAndFlush(b);
        var request = new SwapSlotsRequest(); request.setSlotAId(a.getId()); request.setSlotBId(b.getId());
        schedule.swapSlots(chit.getId(), request, auth());
        var jdbc = new JdbcTemplate(dataSource); var mapper = new ObjectMapper();
        String payload = jdbc.queryForObject("""
                SELECT CAST(payload AS CHAR) FROM audit_event_outbox
                WHERE tenant_id=? AND entity_id=? AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.action'))='SLOT_SWAPPED'
                """, String.class, tenant, a.getId().toString());
        var event = mapper.readTree(payload);
        var before = mapper.readTree(event.path("beforeState").asText());
        var after = mapper.readTree(event.path("afterState").asText());
        assertThat(before.path("memberId").asText()).isEqualTo(member.toString());
        assertThat(before.path("orgHeld").asBoolean()).isFalse();
        assertThat(after.path("memberId").isNull()).isTrue();
        assertThat(after.path("orgHeld").asBoolean()).isTrue();
        assertThat(after.path("swappedWithSlot").asText()).isEqualTo(b.getId().toString());
        assertThat(event.path("actorId").asText()).isEqualTo(admin.toString());
        assertThat(auditCount("SLOT_SWAPPED")).isEqualTo(2);

        schedule.processSlot(chit.getId(), b.getId(), auth());
        payload = jdbc.queryForObject("""
                SELECT CAST(payload AS CHAR) FROM audit_event_outbox
                WHERE tenant_id=? AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.action'))='SLOT_PROCESSED'
                """, String.class, tenant);
        event = mapper.readTree(payload);
        assertThat(mapper.readTree(event.path("beforeState").asText()).path("status").asText()).isEqualTo("RESERVED");
        assertThat(mapper.readTree(event.path("afterState").asText()).path("status").asText()).isEqualTo("PROCESSED");
        assertThat(slots.findById(b.getId()).orElseThrow().getMemberId()).isEqualTo(member);
    }
    @Test void approvalFailureRollsBackEarlierSlotAndItsAudit() {
        var slot = freeSlot(1); var response = interested(1); response.setRequestedDrawNumbers("[1,2]"); responseRows.saveAndFlush(response);
        assertThatThrownBy(() -> invitations.approveResponse(chit.getId(), invitation.getId(), response.getId(), admin))
                .isInstanceOf(BusinessException.class).hasMessageContaining("not available");
        assertThat(slots.findById(slot.getId()).orElseThrow().getStatus()).isEqualTo(ReservationStatus.UNALLOCATED);
        assertThat(responseRows.findById(response.getId()).orElseThrow().isApproved()).isFalse();
        assertThat(auditCount("SLOT_ALLOCATED_FROM_INVITATION")).isZero();
    }
    @Test void concurrentScheduleCreationCannotExceedCapacity() throws Exception {
        var a = new ReservationSlotRequest(); a.setReservationMonth(LocalDate.now());
        var b = new ReservationSlotRequest(); b.setReservationMonth(LocalDate.now());
        oneSucceeds(race(() -> schedule.addSlot(chit.getId(), a, auth()), () -> schedule.addSlot(chit.getId(), b, auth())));
        assertThat(slots.countByChitIdAndStatusNot(chit.getId(), ReservationStatus.VOIDED)).isEqualTo(1);
        assertThat(auditCount("SLOT_CREATED")).isEqualTo(1);
    }
    @Test void memberResponseCannotReopenClosedInvitationAndTenantCannotLockForeignChit() {
        var response = interested(1); invitations.closeInvitation(chit.getId(), invitation.getId());
        var request = new RespondToInvitationRequest(); request.setInterested(true);
        assertThatThrownBy(() -> invitations.respondToInvitation(invitation.getId(), response.getMemberId(), request))
                .isInstanceOf(BusinessException.class).hasMessageContaining("closed");
        TenantContext.set("another-tenant");
        assertThatThrownBy(() -> invitations.approveResponse(chit.getId(), invitation.getId(), response.getId(), admin))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> invitations.respondToInvitation(invitation.getId(), response.getMemberId(), request))
                .isInstanceOf(BusinessException.class);
    }
    com.chitfund.common.dto.DrawSkipResult applied(ChitLifecycleCommand command) {
        return new com.chitfund.common.dto.DrawSkipResult(command.getId(), skips.decode(command).fingerprint(), "APPLIED", null);
    }
    com.chitfund.common.dto.DrawSkipRequest skipRequest() {
        chit.setStatus(ChitStatus.ACTIVE); chit.setEndDate(LocalDate.of(2027, 1, 1)); chitRows.saveAndFlush(chit);
        UUID member = UUID.randomUUID();
        enrollmentRows.saveAndFlush(ChitEnrollment.builder().chit(chit).memberId(member).active(true).build());
        var request = new com.chitfund.common.dto.DrawSkipRequest(); request.setAttemptId(UUID.randomUUID()); request.setChitId(chit.getId()); request.setMonthNumber(1);
        request.setDueDate(LocalDate.now()); request.setInstallmentAmount(new BigDecimal("1000"));
        request.setSkipReason("Holiday pause"); request.setMemberIds(List.of(member)); return request;
    }
    @Test void duplicateSkipRequestsCommitOneCommandAndBlockDependentChangesUntilOneShift() throws Exception {
        var request = skipRequest(); var slot = freeSlot(1);
        var result = race(() -> skips.submit(request, admin, "ADMIN"), () -> skips.submit(request, admin, "MANAGER"));
        assertThat(result).allMatch(Objects::isNull);
        var rows = commands.findByTenantIdAndChitIdOrderByCreatedAt(tenant, chit.getId()); assertThat(rows).hasSize(1);
        assertThat(slots.findById(slot.getId()).orElseThrow().getMonthNumber()).isEqualTo(1);
        assertThatThrownBy(() -> new TransactionTemplate(transactionManager).execute(status -> chits.findByIdForUpdate(chit.getId()))).isInstanceOf(BusinessException.class).hasMessageContaining("still syncing");
        var claimed = lifecycle.claim(rows.get(0).getId()).orElseThrow();
        skips.complete(claimed, applied(claimed)); // simulate an acknowledged payment receipt
        skips.complete(claimed, applied(claimed)); // lost acknowledgement/repeated worker completion
        assertThat(slots.findById(slot.getId()).orElseThrow().getMonthNumber()).isEqualTo(2);
        assertThat(chitRows.findById(chit.getId()).orElseThrow().getEndDate()).isEqualTo(LocalDate.of(2027, 2, 1));
        assertThat(chitRows.findById(chit.getId()).orElseThrow().getScheduleSyncCommandId()).isNull();
        assertThat(auditCount("SLOT_SHIFTED")).isEqualTo(1); assertThat(auditCount("SLOTS_SHIFTED")).isEqualTo(1);
        assertThat(skips.submit(request, admin, "ADMIN").get("status")).isEqualTo("COMPLETED");
    }
    @Test void aLostClaimCannotShiftAndAReplacementCompletesExactlyOnce() {
        var request = skipRequest(); var slot = freeSlot(1); UUID id = (UUID) skips.submit(request, admin, "ADMIN").get("commandId");
        var old = lifecycle.claim(id).orElseThrow();
        new JdbcTemplate(dataSource).update("UPDATE chit_lifecycle_commands SET claimed_until=DATE_SUB(NOW(6), INTERVAL 1 SECOND) WHERE id=?", id.toString());
        var replacement = lifecycle.claim(id).orElseThrow();
        skips.complete(old, applied(old)); assertThat(slots.findById(slot.getId()).orElseThrow().getMonthNumber()).isEqualTo(1);
        skips.complete(replacement, applied(replacement)); assertThat(slots.findById(slot.getId()).orElseThrow().getMonthNumber()).isEqualTo(2);
    }
    @Test void failedLocalCompletionRollsBackSlotsEndDateReceiptAndAuditsTogether() {
        var request = skipRequest(); var slot = freeSlot(1); UUID id = (UUID) skips.submit(request, admin, "ADMIN").get("commandId");
        var claimed = lifecycle.claim(id).orElseThrow();
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> { skips.complete(claimed, applied(claimed)); status.setRollbackOnly(); });
        assertThat(slots.findById(slot.getId()).orElseThrow().getMonthNumber()).isEqualTo(1);
        assertThat(commands.findById(id).orElseThrow().getStatus()).isEqualTo("PROCESSING");
        assertThat(chitRows.findById(chit.getId()).orElseThrow().getScheduleSyncCommandId()).isEqualTo(id);
        assertThat(chitRows.findById(chit.getId()).orElseThrow().getEndDate()).isEqualTo(LocalDate.of(2027, 1, 1));
        assertThat(auditCount("SLOT_SHIFTED")).isZero();
        skips.complete(claimed, applied(claimed)); assertThat(auditCount("SLOT_SHIFTED")).isEqualTo(1);
    }
    @Test void aChangedDuplicateRequestCannotReplaceTheOriginalPendingEvidence() {
        var request = skipRequest(); skips.submit(request, admin, "ADMIN"); request.setSkipReason("Different reason");
        assertThatThrownBy(() -> skips.submit(request, admin, "MANAGER")).isInstanceOf(BusinessException.class).hasMessageContaining("different details");
        assertThat(commands.findByTenantIdAndChitIdOrderByCreatedAt(tenant, chit.getId())).hasSize(1);
    }
    @Test void processedTargetConflictLeavesTheSkipAndAllSlotsUntouched() {
        var request = skipRequest(); var moving = freeSlot(1); var processed = freeSlot(2); processed.setStatus(ReservationStatus.PROCESSED); slots.saveAndFlush(processed);
        assertThatThrownBy(() -> skips.submit(request, admin, "ADMIN")).isInstanceOf(BusinessException.class).hasMessageContaining("processed slot");
        assertThat(commands.findByTenantIdAndChitIdOrderByCreatedAt(tenant, chit.getId())).isEmpty();
        assertThat(slots.findById(moving.getId()).orElseThrow().getMonthNumber()).isEqualTo(1);
        assertThat(chitRows.findById(chit.getId()).orElseThrow().getScheduleSyncCommandId()).isNull();
    }
    @Test void manualShiftRequiresIdentityAndReplaysWithoutShiftingAgain() {
        freeSlot(1); UUID key = UUID.randomUUID();
        assertThatThrownBy(() -> skips.shiftSchedule(chit.getId(), 1, null, admin, "ADMIN")).isInstanceOf(BusinessException.class);
        var response = skips.shiftSchedule(chit.getId(), 1, key, admin, "ADMIN"); skips.shiftSchedule(chit.getId(), 1, key, admin, "ADMIN");
        var claimed = lifecycle.claim((UUID) response.get("commandId")).orElseThrow(); skips.complete(claimed, applied(claimed));
        assertThat(slots.findByChitIdAndTenantId(chit.getId(), tenant)).singleElement().extracting(MonthReservation::getMonthNumber).isEqualTo(2);
        assertThatThrownBy(() -> skips.shiftSchedule(chit.getId(), 2, key, admin, "ADMIN")).isInstanceOf(BusinessException.class).hasMessageContaining("different details");
        assertThat(auditCount("SLOT_SHIFTED")).isEqualTo(1);
    }
    @Test void confirmedNoEffectRejectionReleasesTheChitWithoutShiftingItsSchedule() {
        var request = skipRequest(); var slot = freeSlot(1); UUID id = (UUID) skips.submit(request, admin, "ADMIN").get("commandId");
        var claimed = lifecycle.claim(id).orElseThrow();
        var result = new com.chitfund.common.dto.DrawSkipResult(id, skips.decode(claimed).fingerprint(), "REJECTED", "DRAW_ALREADY_EXISTS");
        skips.complete(claimed, result); skips.complete(claimed, result);
        assertThat(slots.findById(slot.getId()).orElseThrow().getMonthNumber()).isEqualTo(1);
        assertThat(chitRows.findById(chit.getId()).orElseThrow().getEndDate()).isEqualTo(LocalDate.of(2027, 1, 1));
        assertThat(chitRows.findById(chit.getId()).orElseThrow().getScheduleSyncCommandId()).isNull();
        assertThat(chits.getLifecycleSync(chit.getId()).getStatus()).isEqualTo("REJECTED");
        assertThat(auditCount("DRAW_SKIP_REJECTED")).isEqualTo(1); assertThat(auditCount("SLOTS_SHIFTED")).isZero();
    }
    @Test void unverifiedResponseKeepsTheChitProtectedAndDoesNotShift() {
        var request = skipRequest(); var slot = freeSlot(1); UUID id = (UUID) skips.submit(request, admin, "ADMIN").get("commandId"); var claimed = lifecycle.claim(id).orElseThrow();
        assertThatThrownBy(() -> skips.complete(claimed, new com.chitfund.common.dto.DrawSkipResult(id, "wrong-hash", "REJECTED", null))).isInstanceOf(BusinessException.class);
        assertThat(chitRows.findById(chit.getId()).orElseThrow().getScheduleSyncCommandId()).isEqualTo(id);
        assertThat(slots.findById(slot.getId()).orElseThrow().getMonthNumber()).isEqualTo(1);
    }
    @Test void duplicateLiveOrdinalsAndEmptyOrCompletedManualShiftsAreRejectedBeforeMutation() {
        freeSlot(1); freeSlot(1);
        assertThatThrownBy(() -> skips.shiftSchedule(chit.getId(), 1, UUID.randomUUID(), admin, "ADMIN")).isInstanceOf(BusinessException.class).hasMessageContaining("duplicate draw");
        assertThat(auditCount("SLOT_SHIFTED")).isZero();
        assertThatThrownBy(() -> skips.shiftSchedule(chit.getId(), 9, UUID.randomUUID(), admin, "ADMIN")).isInstanceOf(BusinessException.class);
        chit.setStatus(ChitStatus.COMPLETED); chitRows.saveAndFlush(chit);
        assertThatThrownBy(() -> skips.shiftSchedule(chit.getId(), 1, UUID.randomUUID(), admin, "ADMIN")).isInstanceOf(BusinessException.class).hasMessageContaining("no longer");
    }
    @Test void aFreshAttemptCanFollowAProvenRejectionButOldRetriesKeepTheirOriginalResult() {
        var request = skipRequest(); var slot = freeSlot(1);
        UUID oldId = (UUID) skips.submit(request, admin, "ADMIN").get("commandId"); var oldClaim = lifecycle.claim(oldId).orElseThrow();
        skips.complete(oldClaim, new com.chitfund.common.dto.DrawSkipResult(oldId, skips.decode(oldClaim).fingerprint(), "REJECTED", "DRAW_ALREADY_EXISTS"));
        UUID firstAttempt = request.getAttemptId(); request.setAttemptId(UUID.randomUUID());
        UUID newId = (UUID) skips.submit(request, admin, "ADMIN").get("commandId"); assertThat(newId).isNotEqualTo(oldId);
        request.setAttemptId(firstAttempt); assertThat(skips.submit(request, admin, "ADMIN").get("status")).isEqualTo("REJECTED");
        var newClaim = lifecycle.claim(newId).orElseThrow(); skips.complete(newClaim, applied(newClaim));
        assertThat(slots.findById(slot.getId()).orElseThrow().getMonthNumber()).isEqualTo(2);
        assertThat(auditCount("SLOT_SHIFTED")).isEqualTo(1);
    }
    ReservationSlotRequest edit(MonthReservation slot, UUID member) {
        var r = new ReservationSlotRequest(); r.setReservationMonth(slot.getReservationMonth());
        r.setMemberId(member); r.setExpectedVersion(slot.getVersion()); return r;
    }
    @Configuration @EnableTransactionManagement
    @EnableJpaRepositories(basePackageClasses = ChitRepository.class)
    @Import({ChitService.class, InvitationService.class, EnrollmentService.class, ReservationController.class, AuditClient.class, DrawSkipCoordinator.class, ChitLifecycleCommandStore.class})
    static class Config {
        @Bean DataSource dataSource() { return new DriverManagerDataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword()); }
        @Bean Flyway flyway(DataSource ds) { var f=Flyway.configure().dataSource(ds).locations("classpath:db/migration").load(); f.migrate(); return f; }
        @Bean @DependsOn("flyway") LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource ds) {
            var f=new LocalContainerEntityManagerFactoryBean(); f.setDataSource(ds); f.setPackagesToScan("com.chitfund.chitservice.domain.entity");
            f.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            f.setJpaPropertyMap(Map.of("hibernate.type.preferred_uuid_jdbc_type","VARCHAR", "hibernate.physical_naming_strategy","org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy")); return f;
        }
        @Bean PlatformTransactionManager transactionManager(EntityManagerFactory emf) { return new JpaTransactionManager(emf); }
        @Bean ChitMapper mapper() { return new ChitMapperImpl(); }
        @Bean ObjectMapper objectMapper() { return new ObjectMapper().findAndRegisterModules(); }
        @Bean ChitAttributeService attributes(ObjectMapper json) { return new ChitAttributeService(json); }
        @Bean PlanLimitChecker planLimits() { return mock(PlanLimitChecker.class); }
        @Bean NotificationClient notifications() { return mock(NotificationClient.class); }
        @Bean DurableAuditOutbox auditOutbox(DataSource ds) { return new DurableAuditOutbox(new JdbcTemplate(ds)); }
    }
}
