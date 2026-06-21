package com.chitfund.common.exception;

import org.springframework.http.HttpStatus;

/**
 * Thrown when a requested entity doesn't exist.
 * Maps to HTTP 404 Not Found.
 *
 * WHY a separate class instead of BusinessException(CHIT_NOT_FOUND)?
 * - Common enough to deserve first-class treatment
 * - GlobalExceptionHandler handles it specifically → always 404
 * - Spring Data's findById returns Optional; we throw this if empty
 *
 * USAGE PATTERN (Repository → Service):
 *   Chit chit = chitRepository.findById(id)
 *       .orElseThrow(() -> new ResourceNotFoundException("Chit", id));
 */
public class ResourceNotFoundException extends BusinessException {

    public ResourceNotFoundException(String message) {
        super(ErrorCode.RESOURCE_NOT_FOUND, message, HttpStatus.NOT_FOUND);
    }

    public ResourceNotFoundException(String entity, Object id) {
        super(ErrorCode.RESOURCE_NOT_FOUND,
              String.format("%s not found with id: %s", entity, id),
              HttpStatus.NOT_FOUND);
    }
}
