package com.chitfund.supportservice.controller.hub;

import com.chitfund.supportservice.dto.request.CreateRoleRequest;
import com.chitfund.supportservice.dto.response.HubRoleResponse;
import com.chitfund.supportservice.service.HubRoleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/hub/roles")
@RequiredArgsConstructor
public class HubRoleController {

    private final HubRoleService roleService;

    @GetMapping
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> listAll() {
        List<HubRoleResponse> roles = roleService.listAll();
        return ResponseEntity.ok(Map.of("success", true, "data", roles));
    }

    @PostMapping
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> create(@Valid @RequestBody CreateRoleRequest body) {
        HubRoleResponse role = roleService.create(body);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("success", true, "data", role));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> update(@PathVariable String id,
                                     @Valid @RequestBody CreateRoleRequest body) {
        HubRoleResponse role = roleService.update(id, body);
        return ResponseEntity.ok(Map.of("success", true, "data", role));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<?> delete(@PathVariable String id) {
        roleService.delete(id);
        return ResponseEntity.ok(Map.of("success", true));
    }
}
