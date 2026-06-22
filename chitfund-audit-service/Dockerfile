# ── Stage 1: Build ────────────────────────────────────────────────────────────
# WHY maven image? JDK alone has no mvn binary. maven:3.9 bundles both.
# WHY eclipse-temurin? It's the successor to AdoptOpenJDK — widely trusted for production.
FROM maven:3.9.10-eclipse-temurin-21-alpine AS build
WORKDIR /workspace

# Copy only pom files first so Maven dependency layer is cached separately.
# Rebuilding source code does NOT re-download deps — Docker cache hit on this layer.
COPY pom.xml ./
COPY common/pom.xml common/
COPY audit-service/pom.xml audit-service/

RUN mvn -pl common,audit-service -am dependency:go-offline -q --no-transfer-progress 2>/dev/null || true

COPY common/src common/src
COPY audit-service/src audit-service/src

RUN mvn -pl common,audit-service -am package -DskipTests -q --no-transfer-progress

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
# WHY JRE not JDK? Runtime needs only the JRE (~85MB vs ~400MB for JDK).
# Smaller image = faster pulls, smaller attack surface.
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# WHY non-root? Root in container = root on host if container escapes.
# Security best practice: always run app processes as a non-privileged user.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

COPY --from=build /workspace/audit-service/target/audit-service-*.jar app.jar

EXPOSE 8088

# WHY these JVM flags?
# UseContainerSupport: respect cgroup CPU/RAM limits — critical in K8s/Docker
# MaxRAMPercentage=75: use 75% of container RAM for heap, leave 25% for OS + metaspace
# egd=urandom: avoids blocking SecureRandom on /dev/random in containers with low entropy
ENTRYPOINT ["java", \
  "-XX:+UseContainerSupport", \
  "-XX:MaxRAMPercentage=75.0", \
  "-Djava.security.egd=file:/dev/./urandom", \
  "-jar", "app.jar"]
