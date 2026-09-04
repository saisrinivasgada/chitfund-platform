package com.chitfund.supportservice.controller.hub;

import com.chitfund.supportservice.dto.request.CreateHubGroupRequest;
import com.chitfund.supportservice.dto.request.SendHubMessageRequest;
import com.chitfund.supportservice.dto.request.StartHubDmRequest;
import com.chitfund.supportservice.dto.response.*;
import com.chitfund.supportservice.service.EmployeeService;
import com.chitfund.supportservice.service.HubChatService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/hub/chat")
@RequiredArgsConstructor
public class HubChatController {

    private final HubChatService hubChatService;
    private final EmployeeService employeeService;

    // ── DMs ──────────────────────────────────────────────────────────────────

    @PostMapping("/dms")
    public ResponseEntity<?> startOrGetDm(Authentication auth,
                                           @Valid @RequestBody StartHubDmRequest body) {
        String callerId = (String) auth.getPrincipal();
        HubConversationResponse conv = hubChatService.startOrGetDm(callerId, body);
        return ResponseEntity.ok(Map.of("success", true, "data", conv));
    }

    @GetMapping("/dms")
    public ResponseEntity<?> listDms(Authentication auth) {
        String callerId = (String) auth.getPrincipal();
        List<HubConversationResponse> convs = hubChatService.listDms(callerId);
        return ResponseEntity.ok(Map.of("success", true, "data", convs));
    }

    @GetMapping("/dms/{convId}/messages")
    public ResponseEntity<?> getDmMessages(Authentication auth,
                                            @PathVariable String convId,
                                            @RequestParam(required = false) String cursor,
                                            @RequestParam(defaultValue = "50") int limit) {
        String callerId = (String) auth.getPrincipal();
        PagedResponse<HubMessageResponse> msgs = hubChatService.getDmMessages(convId, callerId, cursor, limit);
        return ResponseEntity.ok(Map.of("success", true, "data", msgs));
    }

    @PostMapping("/dms/{convId}/messages")
    public ResponseEntity<?> sendDmMessage(Authentication auth,
                                            @PathVariable String convId,
                                            @Valid @RequestBody SendHubMessageRequest body) {
        String callerId = (String) auth.getPrincipal();
        String callerName = employeeService.getById(callerId).getFullName();

        HubMessageResponse msg = hubChatService.sendDmMessage(convId, callerId, callerName, body);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("success", true, "data", msg));
    }

    @PutMapping("/dms/{convId}/messages/{msgId}/delete")
    public ResponseEntity<?> deleteDmMessage(Authentication auth,
                                              @PathVariable String convId,
                                              @PathVariable String msgId) {
        String callerId = (String) auth.getPrincipal();
        hubChatService.deleteDmMessage(convId, msgId, callerId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PutMapping("/dms/{convId}/read")
    public ResponseEntity<?> markDmRead(Authentication auth, @PathVariable String convId) {
        String callerId = (String) auth.getPrincipal();
        hubChatService.markDmRead(convId, callerId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    // ── Groups ────────────────────────────────────────────────────────────────

    @PostMapping("/groups")
    public ResponseEntity<?> createHubGroup(Authentication auth,
                                             @Valid @RequestBody CreateHubGroupRequest body) {
        String callerId = (String) auth.getPrincipal();
        String callerName = (String) auth.getDetails();
        if (callerName == null) callerName = callerId;

        HubGroupResponse group = hubChatService.createHubGroup(callerId, callerName, body);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("success", true, "data", group));
    }

    @GetMapping("/groups")
    public ResponseEntity<?> listHubGroups(Authentication auth) {
        String callerId = (String) auth.getPrincipal();
        List<HubGroupResponse> groups = hubChatService.listHubGroups(callerId);
        return ResponseEntity.ok(Map.of("success", true, "data", groups));
    }

    @PostMapping("/groups/{groupId}/members/{employeeId}")
    public ResponseEntity<?> addGroupMember(Authentication auth,
                                             @PathVariable String groupId,
                                             @PathVariable String employeeId) {
        String callerId = (String) auth.getPrincipal();
        String callerRole = auth.getAuthorities().iterator().next().getAuthority();
        hubChatService.addHubGroupMember(groupId, callerId, callerRole, employeeId);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @DeleteMapping("/groups/{groupId}/members/{employeeId}")
    public ResponseEntity<?> removeGroupMember(Authentication auth,
                                                @PathVariable String groupId,
                                                @PathVariable String employeeId) {
        String callerId = (String) auth.getPrincipal();
        String callerRole = auth.getAuthorities().iterator().next().getAuthority();
        hubChatService.removeHubGroupMember(groupId, employeeId, callerId, callerRole);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @GetMapping("/groups/{groupId}/messages")
    public ResponseEntity<?> getGroupMessages(Authentication auth,
                                               @PathVariable String groupId,
                                               @RequestParam(required = false) String cursor,
                                               @RequestParam(defaultValue = "50") int limit) {
        String callerId = (String) auth.getPrincipal();
        PagedResponse<HubMessageResponse> msgs = hubChatService.getHubGroupMessages(groupId, callerId, cursor, limit);
        return ResponseEntity.ok(Map.of("success", true, "data", msgs));
    }

    @PostMapping("/groups/{groupId}/messages")
    public ResponseEntity<?> sendGroupMessage(Authentication auth,
                                               @PathVariable String groupId,
                                               @Valid @RequestBody SendHubMessageRequest body) {
        String callerId = (String) auth.getPrincipal();
        String callerName = (String) auth.getDetails();
        if (callerName == null) callerName = callerId;

        HubMessageResponse msg = hubChatService.sendHubGroupMessage(groupId, callerId, callerName, body);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("success", true, "data", msg));
    }

    @PutMapping("/groups/{groupId}/messages/{msgId}/delete")
    public ResponseEntity<?> deleteGroupMessage(Authentication auth,
                                                 @PathVariable String groupId,
                                                 @PathVariable String msgId) {
        String callerId = (String) auth.getPrincipal();
        hubChatService.deleteHubGroupMessage(groupId, msgId, callerId);
        return ResponseEntity.ok(Map.of("success", true));
    }
}
