package com.chitfund.common.event;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;

import java.io.IOException;
import java.time.Instant;

public record AuditLogEvent(
        String serviceName,
        String entityType,
        String entityId,
        String chitId,
        String action,
        String actorId,
        String actorRole,
        String actorIp,
        String beforeState,
        String afterState,
        String metadata,
        String tenantId,
        String correlationId,
        String idempotencyKey,
        String source,
        String outcome,
        String reason,
        String effectiveActorId,
        String effectiveActorRole,
        String deviceSessionHash,
        @JsonSerialize(using = InstantIsoSerializer.class)
        @JsonDeserialize(using = InstantIsoDeserializer.class)
        Instant occurredAt,
        @JsonSerialize(using = InstantIsoSerializer.class)
        @JsonDeserialize(using = InstantIsoDeserializer.class)
        Instant originalOfflineAt,
        @JsonSerialize(using = InstantIsoSerializer.class)
        @JsonDeserialize(using = InstantIsoDeserializer.class)
        Instant synchronizedAt
) {
    /** Backward-compatible constructor for producers that do not yet supply enriched context. */
    public AuditLogEvent(String serviceName, String entityType, String entityId, String chitId,
                         String action, String actorId, String actorRole, String actorIp,
                         String beforeState, String afterState, String metadata, String tenantId) {
        this(serviceName, entityType, entityId, chitId, action, actorId, actorRole, actorIp,
                beforeState, afterState, metadata, tenantId,
                null, null, null, "SUCCESS", null, null, null, null,
                Instant.now(), null, null);
    }

    /**
     * The audit event is a cross-service SQS wire contract. Explicit ISO serializers
     * keep it portable even when a producer uses a minimal ObjectMapper rather than
     * Spring Boot's globally configured Java-time module.
     */
    public static final class InstantIsoSerializer extends JsonSerializer<Instant> {
        @Override
        public void serialize(Instant value, JsonGenerator generator,
                              SerializerProvider serializers) throws IOException {
            generator.writeString(value.toString());
        }
    }

    public static final class InstantIsoDeserializer extends JsonDeserializer<Instant> {
        @Override
        public Instant deserialize(JsonParser parser, DeserializationContext context)
                throws IOException {
            return Instant.parse(parser.getValueAsString());
        }
    }
}
