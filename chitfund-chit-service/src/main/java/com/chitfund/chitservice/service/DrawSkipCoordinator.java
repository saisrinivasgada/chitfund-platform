package com.chitfund.chitservice.service;

import com.chitfund.chitservice.client.AuditClient;
import com.chitfund.chitservice.domain.entity.*;
import com.chitfund.chitservice.domain.enums.*;
import com.chitfund.chitservice.repository.*;
import com.chitfund.common.context.TenantContext;
import com.chitfund.common.dto.*;
import com.chitfund.common.exception.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.*;

/** Parent-owned durable orchestration: payment skip -> one atomic schedule shift. */
@Service
@RequiredArgsConstructor
public class DrawSkipCoordinator {
    public static final String SKIP_DRAW = "SKIP_DRAW";
    private final ChitRepository chits;
    private final MonthReservationRepository reservations;
    private final MonthlyWinnerRepository winners;
    private final ChitEnrollmentRepository enrollments;
    private final ChitLifecycleCommandRepository commands;
    private final ObjectMapper json;
    private final AuditClient audit;
    private final PlanLimitChecker plan;

    @Transactional
    public Map<String, Object> submit(DrawSkipRequest request, UUID actorId, String actorRole) {
        String tenant = TenantContext.get();
        Chit chit = chits.findByIdAndTenantIdForUpdate(request.getChitId(), tenant)
                .orElseThrow(() -> new ResourceNotFoundException("Chit", request.getChitId()));
        if (request.getAttemptId() == null) throw conflict("Include a unique skip attempt before continuing.");
        String key = chit.getId() + ":SKIP:" + request.getMonthNumber() + ":" + request.getAttemptId();
        var prior = commands.findByTenantIdAndDedupeKey(tenant, key);
        if (prior.isPresent()) {
            DrawSkipCommand original = decode(prior.get());
            if (!original.request().fingerprint().equals(request.fingerprint()))
                throw conflict("This draw already has a skip request with different details. Refresh its sync status.");
            return response(prior.get());
        }
        // A pending/applied attempt owns the ordinal. A proven no-effect rejection
        // permits a fresh explicit attempt while old retries retain their old result.
        var previous = commands.findByTenantIdAndChitIdOrderByCreatedAt(tenant, chit.getId()).stream()
                .filter(c -> SKIP_DRAW.equals(c.getCommandType()))
                .filter(c -> Objects.equals(decode(c).request().getMonthNumber(), request.getMonthNumber()))
                .reduce((first, last) -> last);
        if (previous.isPresent() && !"REJECTED".equals(previous.get().getStatus())) {
            if (!decode(previous.get()).request().fingerprint().equals(request.fingerprint()))
                throw conflict("This draw already has a skip request with different details. Refresh its sync status.");
            return response(previous.get());
        }
        plan.checkNotExpired();
        ChitService.assertScheduleReady(chit);
        if (chit.getStatus() != ChitStatus.ACTIVE)
            throw conflict("Only an active chit can skip a draw");
        if (request.getInstallmentAmount().compareTo(chit.getInstallmentAmount()) != 0)
            throw conflict("The instalment amount changed. Refresh this chit before skipping.");
        Set<UUID> requested = new HashSet<>(request.getMemberIds());
        Set<UUID> active = new HashSet<>(enrollments.findActiveMemberIdsByChitIdAndTenantId(chit.getId(), tenant));
        if (active.isEmpty() || requested.size() != request.getMemberIds().size() || !requested.equals(active))
            throw conflict("Draw members changed. Refresh this chit before skipping.");
        validateShift(chit, request.getMonthNumber());
        ChitLifecycleCommand command = ChitLifecycleCommand.builder()
                .id(UUID.randomUUID()).tenantId(tenant).chitId(chit.getId())
                .commandType(SKIP_DRAW).dedupeKey(key).status("PENDING")
                .attempts(0).availableAt(LocalDateTime.now()).createdAt(LocalDateTime.now()).build();
        command.setPayloadJson(encode(new DrawSkipCommand(command.getId(), actorId, actorRole, request)));
        commands.save(command);
        chit.setScheduleSyncCommandId(command.getId());
        chits.save(chit);
        audit.log("CHIT", chit.getId().toString(), chit.getId().toString(), "DRAW_SKIP_REQUESTED",
                actorId.toString(), actorRole, null,
                Map.of("commandId", command.getId(), "monthNumber", request.getMonthNumber(), "status", "PENDING"), tenant);
        return response(command);
    }

    public DrawSkipCommand decode(ChitLifecycleCommand command) {
        try { return json.readValue(command.getPayloadJson(), DrawSkipCommand.class); }
        catch (Exception error) { throw new IllegalStateException("Invalid durable draw skip payload", error); }
    }

    /** Called only after payment-service acknowledges the identical command. */
    @Transactional
    public void complete(ChitLifecycleCommand claimed, DrawSkipResult result) {
        UUID id = claimed.getId(), claimToken = claimed.getClaimToken();
        // Obtain the parent before the command row, matching all schedule writers.
        Chit chit = chits.findByIdAndTenantIdForUpdate(claimed.getChitId(), claimed.getTenantId()).orElseThrow();
        ChitLifecycleCommand command = commands.findByIdForUpdate(id).orElseThrow();
        if (!"PROCESSING".equals(command.getStatus()) || !claimToken.equals(command.getClaimToken())) return;
        if (!id.equals(chit.getScheduleSyncCommandId()))
            throw conflict("The pending schedule command changed; reconciliation is required");
        DrawSkipCommand envelope = decode(command);
        if (result == null || !id.equals(result.commandId()) || !envelope.fingerprint().equals(result.requestHash())
                || !("APPLIED".equals(result.status()) || "REJECTED".equals(result.status())))
            throw conflict("The payment decision could not be verified. The schedule remains protected.");
        if ("REJECTED".equals(result.status())) {
            chit.setScheduleSyncCommandId(null); chits.save(chit);
            command.setStatus("REJECTED"); command.setCompletedAt(LocalDateTime.now());
            command.setClaimToken(null); command.setClaimedUntil(null); command.setLastErrorCode(result.reason());
            commands.save(command);
            audit.log("CHIT", chit.getId().toString(), chit.getId().toString(), "DRAW_SKIP_REJECTED",
                    envelope.actorId().toString(), envelope.actorRole(), null,
                    Map.of("commandId", id, "reason", Objects.toString(result.reason(), "REJECTED")), command.getTenantId());
            return;
        }
        int from = envelope.request().getMonthNumber();
        applyShift(chit, from, envelope.actorId(), envelope.actorRole(), id);
        chit.setScheduleSyncCommandId(null);
        chits.save(chit);
        command.setStatus("COMPLETED"); command.setCompletedAt(LocalDateTime.now());
        command.setClaimToken(null); command.setClaimedUntil(null); command.setLastErrorCode(null);
        commands.save(command);
    }

    @Transactional
    public Map<String,Object> shiftSchedule(UUID chitId, int from, UUID requestId, UUID actorId, String actorRole) {
        if (from < 1 || requestId == null) throw conflict("Update the app and provide a unique schedule request before shifting.");
        Chit chit = chits.findByIdAndTenantIdForUpdate(chitId, TenantContext.get()).orElseThrow(() -> new ResourceNotFoundException("Chit", chitId));
        String key = chitId + ":SHIFT:" + requestId;
        var prior = commands.findByTenantIdAndDedupeKey(chit.getTenantId(), key);
        if (prior.isPresent()) {
            if (decode(prior.get()).request().getMonthNumber() != from) throw conflict("This schedule request was already used with different details.");
            return response(prior.get());
        }
        plan.checkNotExpired();
        ChitService.assertScheduleReady(chit);
        if (chit.getStatus() != ChitStatus.ACTIVE && chit.getStatus() != ChitStatus.DRAFT && chit.getStatus() != ChitStatus.PAUSED)
            throw conflict("This chit's schedule can no longer be shifted");
        if (validateShift(chit, from).isEmpty()) throw conflict("No future reservation slots exist from that draw");
        UUID id = UUID.randomUUID();
        var request = new DrawSkipRequest(); request.setAttemptId(requestId); request.setChitId(chitId); request.setMonthNumber(from);
        request.setDueDate(chit.getStartDate() != null ? chit.getStartDate() : java.time.LocalDate.of(1970, 1, 1));
        request.setInstallmentAmount(chit.getInstallmentAmount()); request.setSkipReason("Manual schedule shift");
        request.setMemberIds(enrollments.findActiveMemberIdsByChitIdAndTenantId(chitId, chit.getTenantId()).stream().distinct().toList());
        var envelope = new DrawSkipCommand(id, actorId, actorRole, request, true);
        var command = ChitLifecycleCommand.builder().id(id).tenantId(chit.getTenantId()).chitId(chitId)
                .commandType("SHIFT_SCHEDULE").dedupeKey(key).payloadJson(encode(envelope)).status("PENDING")
                .attempts(0).createdAt(LocalDateTime.now()).availableAt(LocalDateTime.now()).build();
        commands.save(command); chit.setScheduleSyncCommandId(id); chits.save(chit);
        audit.log("RESERVATION_SCHEDULE", chitId.toString(), chitId.toString(), "SCHEDULE_SHIFT_REQUESTED",
                actorId.toString(), actorRole, null, Map.of("commandId", id, "fromMonth", from), chit.getTenantId());
        return response(command);
    }

    private void applyShift(Chit chit, int from, UUID actorId, String actorRole, UUID id) {
        List<MonthReservation> slots = validateShift(chit, from);
        for (MonthReservation slot : slots) {
            Map<String,Object> before = slotSnapshot(slot);
            slot.setMonthNumber(slot.getMonthNumber() + 1);
            if (slot.getReservationMonth() != null) slot.setReservationMonth(slot.getReservationMonth().plusMonths(1));
            slot.setUpdatedBy(actorId);
            audit.log("RESERVATION_SLOT", slot.getId().toString(), chit.getId().toString(), "SLOT_SHIFTED",
                    actorId.toString(), actorRole, before, slotSnapshot(slot), chit.getTenantId());
        }
        reservations.saveAll(slots);
        var oldEnd = chit.getEndDate();
        if (oldEnd != null) chit.setEndDate(oldEnd.plusMonths(1));
        chits.save(chit);
        Map<String,Object> after = new LinkedHashMap<>();
        after.put("commandId", id); after.put("fromMonth", from); after.put("slotCount", slots.size()); after.put("endDate", chit.getEndDate());
        audit.log("RESERVATION_SCHEDULE", chit.getId().toString(), chit.getId().toString(), "SLOTS_SHIFTED",
                actorId.toString(), actorRole, Collections.singletonMap("endDate", oldEnd), after, chit.getTenantId());
    }

    /** No shifts across historical draws or into an unchanged processed ordinal. */
    List<MonthReservation> validateShift(Chit chit, int from) {
        List<MonthReservation> all = reservations.findByChitIdAndTenantId(chit.getId(), chit.getTenantId());
        if (all.stream().anyMatch(slot -> slot.getMonthNumber() == null || slot.getMonthNumber() < 1 || slot.getMonthNumber() == Integer.MAX_VALUE))
            throw conflict("The schedule contains an invalid draw number. Correct it before shifting.");
        Set<Integer> proposed = new HashSet<>();
        for (MonthReservation slot : all) {
            if (slot.getStatus() == ReservationStatus.VOIDED) continue;
            boolean move = slot.getMonthNumber() >= from && (slot.getStatus() == ReservationStatus.RESERVED || slot.getStatus() == ReservationStatus.UNALLOCATED);
            int target = Math.addExact(slot.getMonthNumber(), move ? 1 : 0);
            if (!proposed.add(target)) throw conflict("The shifted schedule would contain duplicate draw numbers. Correct the slots before continuing.");
        }
        if (all.stream().anyMatch(s -> s.getMonthNumber() >= from && s.getStatus() == ReservationStatus.PROCESSED)
                || winners.findByChitIdOrderByMonthNumberAsc(chit.getId()).stream().anyMatch(w -> w.getMonthNumber() >= from))
            throw conflict("A winner or processed slot already exists at or after this draw. The historical schedule cannot be shifted.");
        List<MonthReservation> moving = all.stream().filter(s -> s.getMonthNumber() >= from
                && (s.getStatus() == ReservationStatus.RESERVED || s.getStatus() == ReservationStatus.UNALLOCATED)).toList();
        Set<Integer> fixed = new HashSet<>();
        all.stream().filter(s -> !moving.contains(s) && s.getStatus() != ReservationStatus.VOIDED).forEach(s -> fixed.add(s.getMonthNumber()));
        if (moving.stream().anyMatch(s -> fixed.contains(s.getMonthNumber() + 1)))
            throw conflict("Shifting would overlap an existing draw slot. Refresh the schedule before continuing.");
        return moving;
    }

    private Map<String,Object> slotSnapshot(MonthReservation slot) {
        Map<String,Object> value = new LinkedHashMap<>(); value.put("monthNumber", slot.getMonthNumber());
        value.put("reservationMonth", slot.getReservationMonth()); value.put("memberId", slot.getMemberId());
        value.put("status", slot.getStatus()); return value;
    }
    private Map<String,Object> response(ChitLifecycleCommand command) {
        return Map.of("commandId", command.getId(), "status", command.getStatus());
    }
    private String encode(Object payload) {
        try { return json.writeValueAsString(payload); }
        catch (Exception error) { throw new IllegalStateException("Could not persist draw skip", error); }
    }
    private BusinessException conflict(String message) {
        return new BusinessException(ErrorCode.CONCURRENT_MODIFICATION, message, HttpStatus.CONFLICT);
    }
}
