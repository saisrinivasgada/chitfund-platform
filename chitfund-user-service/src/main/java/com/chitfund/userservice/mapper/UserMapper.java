package com.chitfund.userservice.mapper;

import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.dto.response.UserResponse;
import org.mapstruct.Mapper;

/**
 * WHY MapStruct instead of manual mapping or ModelMapper?
 * - MapStruct generates plain Java code at compile time — zero reflection, zero runtime overhead
 * - ModelMapper uses reflection at runtime → slower, harder to debug
 * - Manual mapping is error-prone and tedious to maintain
 * - MapStruct fails loudly at compile time if field names don't match — no silent null fields
 *
 * componentModel = "spring": generates a Spring @Component so it can be @Autowired
 *
 * Since User.username maps to UserResponse.username (same name), MapStruct handles it
 * automatically. No @Mapping annotation needed here.
 * If names differ: @Mapping(source = "passwordHash", target = "password")
 */
@Mapper(componentModel = "spring")
public interface UserMapper {
    UserResponse toResponse(User user);
}
