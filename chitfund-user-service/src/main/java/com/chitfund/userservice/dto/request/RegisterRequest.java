package com.chitfund.userservice.dto.request;

import com.chitfund.userservice.domain.enums.Role;
import jakarta.validation.constraints.*;
import lombok.Data;

/**
 * WHY separate Request DTOs instead of accepting the entity directly?
 * - Entities have fields that should never come from the client (id, createdAt, passwordHash)
 * - DTOs are the public contract: you can change entity internals without breaking clients
 * - Validation annotations belong on the DTO, not the entity
 * - NEVER expose your entity directly in a REST API (Mass Assignment vulnerability)
 *
 * WHY @Pattern for username?
 * Prevents injection attacks and ensures readable usernames.
 * Special chars in usernames can break URLs, log parsers, and downstream systems.
 */
@Data
public class RegisterRequest {

    @NotBlank(message = "Username is required")
    @Size(min = 3, max = 50, message = "Username must be between 3 and 50 characters")
    @Pattern(regexp = "^[a-zA-Z0-9_]+$", message = "Username can only contain letters, numbers, and underscores")
    private String username;

    @Email(message = "Invalid email format")
    @Size(max = 255)
    private String email;

    // Null = admin is creating a member account; backend auto-generates a temp password.
    // Provided = self-registration with a chosen password (admin/manager accounts).
    @Size(min = 8, message = "Password must be at least 8 characters")
    private String password;

    // Optional profile fields — useful when admin creates a staff account in one step
    @Size(max = 255)
    private String fullName;

    @Pattern(regexp = "^[0-9+\\-\\s]{7,15}$", message = "Invalid phone number")
    private String phone;

    // Defaults to MEMBER — the most restricted role.
    // Clients cannot self-elevate to ADMIN: only an ADMIN can create ADMIN accounts.
    private Role role = Role.MEMBER;
}
