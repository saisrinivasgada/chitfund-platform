package com.chitfund.chitservice.service;

import com.chitfund.chitservice.domain.entity.Chit;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Centralized utility for reading, writing, and converting the JSON attributes
 * column on Chit. Keeps Jackson boilerplate out of ChitService.
 *
 * WHY JSON column for dynamic attributes?
 * - Sparse optional metadata (commission rate, penalty rate, custom rules) doesn't
 *   warrant new DB columns for every future requirement.
 * - JSON column avoids EAV (Entity-Attribute-Value) table overhead (no extra joins).
 * - MySQL 5.7+ validates JSON on insert; you can add virtual generated columns to
 *   index specific JSON paths without schema changes.
 * - Hibernate 6 supports @JdbcTypeCode(SqlTypes.JSON) for auto-mapping; we store
 *   as String here for maximum portability across MySQL versions.
 *
 * INTERVIEW: "We use a JSON column for extension points. For high-cardinality
 * queryable fields, we'd promote them to proper columns. JSON is for the long tail
 * of rare attributes that don't justify schema migrations."
 */
@Service
@RequiredArgsConstructor
public class ChitAttributeService {

    private final ObjectMapper objectMapper;

    public Map<String, Object> getAll(Chit chit) {
        if (chit.getAttributes() == null || chit.getAttributes().isBlank()) return Map.of();
        try {
            return objectMapper.readValue(chit.getAttributes(), new TypeReference<>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }

    public <T> Optional<T> get(Chit chit, String key, Class<T> type) {
        Object val = getAll(chit).get(key);
        if (val == null) return Optional.empty();
        return Optional.of(objectMapper.convertValue(val, type));
    }

    public void set(Chit chit, String key, Object value) {
        Map<String, Object> attrs = new HashMap<>(getAll(chit));
        attrs.put(key, value);
        chit.setAttributes(serialize(attrs));
    }

    public void remove(Chit chit, String key) {
        Map<String, Object> attrs = new HashMap<>(getAll(chit));
        attrs.remove(key);
        chit.setAttributes(attrs.isEmpty() ? null : serialize(attrs));
    }

    public void setAll(Chit chit, Map<String, Object> attrs) {
        chit.setAttributes(attrs == null || attrs.isEmpty() ? null : serialize(attrs));
    }

    private String serialize(Map<String, Object> attrs) {
        try {
            return objectMapper.writeValueAsString(attrs);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to serialize chit attributes", e);
        }
    }
}
