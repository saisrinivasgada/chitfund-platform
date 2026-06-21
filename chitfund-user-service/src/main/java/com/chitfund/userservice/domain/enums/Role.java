package com.chitfund.userservice.domain.enums;

/**
 * Roles define what a user is allowed to do — RBAC (Role-Based Access Control).
 *
 * WHY four roles?
 * - ADMIN: Full platform control (create chits, manage users, view everything)
 * - MANAGER: Operational role (manage chits and members, cannot touch system config)
 * - AGENT: Field role (record payments, view assigned chits — for on-the-ground collectors)
 * - MEMBER: End-user role (view their own chit, see their payment history)
 *
 * These roles are stored as plain strings (not ROLE_ADMIN prefix) because we use
 * hasAuthority() not hasRole() in SecurityConfig. hasRole() auto-prepends ROLE_.
 * Using hasAuthority() keeps roles readable in the DB and JWT claims.
 *
 * INTERVIEW: "RBAC is simpler to implement but less flexible than ABAC (Attribute-Based).
 * For financial apps at this scale, RBAC is the right starting point. If you need
 * 'MANAGER can only see chits they created', that's when you graduate to ABAC."
 */
public enum Role {
    ADMIN,
    MANAGER,
    WORKER,
    AGENT,    // legacy alias — maps to the same permissions as WORKER
    MEMBER
}