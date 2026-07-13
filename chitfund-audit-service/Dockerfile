# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM maven:3.9.10-eclipse-temurin-21-alpine AS build
WORKDIR /workspace

# Copy pom files first — dep layer cached separately from source changes
COPY pom.xml ./
COPY chitfund-common/pom.xml chitfund-common/
COPY chitfund-audit-service/pom.xml chitfund-audit-service/

RUN mvn -pl chitfund-common,chitfund-audit-service -am dependency:go-offline -q --no-transfer-progress 2>/dev/null || true

COPY chitfund-common/src chitfund-common/src
COPY chitfund-audit-service/src chitfund-audit-service/src

RUN mvn -pl chitfund-common,chitfund-audit-service -am package -DskipTests -q --no-transfer-progress

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

COPY --from=build /workspace/chitfund-audit-service/target/audit-service-*.jar app.jar

EXPOSE 8088

ENTRYPOINT ["java", \
  "-XX:+UseContainerSupport", \
  "-XX:MaxRAMPercentage=75.0", \
  "-Djava.security.egd=file:/dev/./urandom", \
  "-jar", "app.jar"]
