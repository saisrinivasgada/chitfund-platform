#!/usr/bin/env bash
set -euo pipefail

MONO="/Users/saisrinivas/Projects/learning/MyVibeCodingApp/chit-fund-platform"
OUT="/Users/saisrinivas/Projects/learning"
MVN="/Users/saisrinivas/.m2/wrapper/dists/apache-maven-3.9.10-bin/53h08a94dg6djh6umvruv7q564/apache-maven-3.9.10/bin/mvn"

GITIGNORE='target/
*.class
*.jar
*.war
*.ear
.DS_Store
*.iml
.idea/
'

# ─────────────────────────────────────────
# Helper: init repo, commit, create test branch
# ─────────────────────────────────────────
init_repo() {
  local dir="$1"
  cd "$dir"
  git init -b main -q
  git add .
  git commit -q -m "Initial commit: standalone project"
  git checkout -q -b test
  git checkout -q main
  echo "  ✓ git init done — branches: main, test"
  cd - > /dev/null
}

# ─────────────────────────────────────────
# 1. common
# ─────────────────────────────────────────
echo "==> chitfund-common"
mkdir -p "$OUT/chitfund-common"
cp -r "$MONO/common/src" "$OUT/chitfund-common/"
printf '%s' "$GITIGNORE" > "$OUT/chitfund-common/.gitignore"

cat > "$OUT/chitfund-common/pom.xml" << 'POMEOF'
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.5</version>
    <relativePath/>
  </parent>

  <groupId>com.chitfund</groupId>
  <artifactId>common</artifactId>
  <version>1.0.0-SNAPSHOT</version>
  <packaging>jar</packaging>
  <name>Common Module</name>

  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
      <optional>true</optional>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-validation</artifactId>
      <optional>true</optional>
    </dependency>
    <dependency>
      <groupId>com.fasterxml.jackson.core</groupId>
      <artifactId>jackson-databind</artifactId>
    </dependency>
    <dependency>
      <groupId>com.fasterxml.jackson.datatype</groupId>
      <artifactId>jackson-datatype-jsr310</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.data</groupId>
      <artifactId>spring-data-commons</artifactId>
      <optional>true</optional>
    </dependency>
    <dependency>
      <groupId>org.projectlombok</groupId>
      <artifactId>lombok</artifactId>
      <optional>true</optional>
    </dependency>
  </dependencies>
</project>
POMEOF

init_repo "$OUT/chitfund-common"

# ─────────────────────────────────────────
# Helper: write a standard backend service pom
# Args: dir, artifactId, name, extra_deps_xml, needs_mapstruct (true/false)
# ─────────────────────────────────────────
write_standard_pom() {
  local dir="$1" artifactId="$2" name="$3" extra_deps="$4" needs_mapstruct="$5"

  local mapstruct_dep=""
  local mapstruct_processor=""
  if [ "$needs_mapstruct" = "true" ]; then
    mapstruct_dep='
    <dependency>
      <groupId>org.mapstruct</groupId>
      <artifactId>mapstruct</artifactId>
      <version>1.5.5.Final</version>
    </dependency>'
    mapstruct_processor='
          <path>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok-mapstruct-binding</artifactId>
            <version>0.2.0</version>
          </path>
          <path>
            <groupId>org.mapstruct</groupId>
            <artifactId>mapstruct-processor</artifactId>
            <version>1.5.5.Final</version>
          </path>'
  fi

  cat > "$dir/pom.xml" << POMEOF
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.5</version>
    <relativePath/>
  </parent>

  <groupId>com.chitfund</groupId>
  <artifactId>${artifactId}</artifactId>
  <version>1.0.0-SNAPSHOT</version>
  <packaging>jar</packaging>
  <name>${name}</name>

  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-security</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-validation</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-actuator</artifactId>
    </dependency>
    <dependency>
      <groupId>com.mysql</groupId>
      <artifactId>mysql-connector-j</artifactId>
      <scope>runtime</scope>
    </dependency>
    <dependency>
      <groupId>org.flywaydb</groupId>
      <artifactId>flyway-core</artifactId>
    </dependency>
    <dependency>
      <groupId>org.flywaydb</groupId>
      <artifactId>flyway-mysql</artifactId>
    </dependency>
    <dependency>
      <groupId>io.jsonwebtoken</groupId>
      <artifactId>jjwt-api</artifactId>
      <version>0.12.5</version>
    </dependency>
    <dependency>
      <groupId>io.jsonwebtoken</groupId>
      <artifactId>jjwt-impl</artifactId>
      <version>0.12.5</version>
      <scope>runtime</scope>
    </dependency>
    <dependency>
      <groupId>io.jsonwebtoken</groupId>
      <artifactId>jjwt-jackson</artifactId>
      <version>0.12.5</version>
      <scope>runtime</scope>
    </dependency>
    <dependency>
      <groupId>com.chitfund</groupId>
      <artifactId>common</artifactId>
      <version>1.0.0-SNAPSHOT</version>
    </dependency>
    <dependency>
      <groupId>org.projectlombok</groupId>
      <artifactId>lombok</artifactId>
      <optional>true</optional>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>${mapstruct_dep}${extra_deps}
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
        <configuration>
          <excludes>
            <exclude>
              <groupId>org.projectlombok</groupId>
              <artifactId>lombok</artifactId>
            </exclude>
          </excludes>
        </configuration>
      </plugin>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <configuration>
          <source>21</source>
          <target>21</target>
          <annotationProcessorPaths>
            <path>
              <groupId>org.projectlombok</groupId>
              <artifactId>lombok</artifactId>
              <version>1.18.32</version>
            </path>${mapstruct_processor}
          </annotationProcessorPaths>
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>
POMEOF
}

KAFKA_DEP='
    <dependency>
      <groupId>org.springframework.kafka</groupId>
      <artifactId>spring-kafka</artifactId>
    </dependency>'

# ─────────────────────────────────────────
# 2. user-service
# ─────────────────────────────────────────
echo "==> chitfund-user-service"
mkdir -p "$OUT/chitfund-user-service"
cp -r "$MONO/user-service/src" "$OUT/chitfund-user-service/"
[ -f "$MONO/user-service/Dockerfile" ] && cp "$MONO/user-service/Dockerfile" "$OUT/chitfund-user-service/"
printf '%s' "$GITIGNORE" > "$OUT/chitfund-user-service/.gitignore"
write_standard_pom "$OUT/chitfund-user-service" "user-service" "User Service" "" "true"
init_repo "$OUT/chitfund-user-service"

# ─────────────────────────────────────────
# 3. member-service
# ─────────────────────────────────────────
echo "==> chitfund-member-service"
mkdir -p "$OUT/chitfund-member-service"
cp -r "$MONO/member-service/src" "$OUT/chitfund-member-service/"
[ -f "$MONO/member-service/Dockerfile" ] && cp "$MONO/member-service/Dockerfile" "$OUT/chitfund-member-service/"
printf '%s' "$GITIGNORE" > "$OUT/chitfund-member-service/.gitignore"
write_standard_pom "$OUT/chitfund-member-service" "member-service" "Member Service" "" "true"
init_repo "$OUT/chitfund-member-service"

# ─────────────────────────────────────────
# 4. chit-service
# ─────────────────────────────────────────
echo "==> chitfund-chit-service"
mkdir -p "$OUT/chitfund-chit-service"
cp -r "$MONO/chit-service/src" "$OUT/chitfund-chit-service/"
[ -f "$MONO/chit-service/Dockerfile" ] && cp "$MONO/chit-service/Dockerfile" "$OUT/chitfund-chit-service/"
printf '%s' "$GITIGNORE" > "$OUT/chitfund-chit-service/.gitignore"
write_standard_pom "$OUT/chitfund-chit-service" "chit-service" "Chit Service" "" "true"
init_repo "$OUT/chitfund-chit-service"

# ─────────────────────────────────────────
# 5. payment-service
# ─────────────────────────────────────────
echo "==> chitfund-payment-service"
mkdir -p "$OUT/chitfund-payment-service"
cp -r "$MONO/payment-service/src" "$OUT/chitfund-payment-service/"
[ -f "$MONO/payment-service/Dockerfile" ] && cp "$MONO/payment-service/Dockerfile" "$OUT/chitfund-payment-service/"
printf '%s' "$GITIGNORE" > "$OUT/chitfund-payment-service/.gitignore"
write_standard_pom "$OUT/chitfund-payment-service" "payment-service" "Payment Service" "$KAFKA_DEP" "true"
init_repo "$OUT/chitfund-payment-service"

# ─────────────────────────────────────────
# 6. payout-service
# ─────────────────────────────────────────
echo "==> chitfund-payout-service"
mkdir -p "$OUT/chitfund-payout-service"
cp -r "$MONO/payout-service/src" "$OUT/chitfund-payout-service/"
[ -f "$MONO/payout-service/Dockerfile" ] && cp "$MONO/payout-service/Dockerfile" "$OUT/chitfund-payout-service/"
printf '%s' "$GITIGNORE" > "$OUT/chitfund-payout-service/.gitignore"
write_standard_pom "$OUT/chitfund-payout-service" "payout-service" "Payout Service" "$KAFKA_DEP" "false"
init_repo "$OUT/chitfund-payout-service"

# ─────────────────────────────────────────
# 7. notification-service
# ─────────────────────────────────────────
echo "==> chitfund-notification-service"
mkdir -p "$OUT/chitfund-notification-service"
cp -r "$MONO/notification-service/src" "$OUT/chitfund-notification-service/"
[ -f "$MONO/notification-service/Dockerfile" ] && cp "$MONO/notification-service/Dockerfile" "$OUT/chitfund-notification-service/"
printf '%s' "$GITIGNORE" > "$OUT/chitfund-notification-service/.gitignore"
write_standard_pom "$OUT/chitfund-notification-service" "notification-service" "Notification Service" "$KAFKA_DEP" "false"
init_repo "$OUT/chitfund-notification-service"

# ─────────────────────────────────────────
# 8. reporting-service
# ─────────────────────────────────────────
echo "==> chitfund-reporting-service"
mkdir -p "$OUT/chitfund-reporting-service"
cp -r "$MONO/reporting-service/src" "$OUT/chitfund-reporting-service/"
[ -f "$MONO/reporting-service/Dockerfile" ] && cp "$MONO/reporting-service/Dockerfile" "$OUT/chitfund-reporting-service/"
printf '%s' "$GITIGNORE" > "$OUT/chitfund-reporting-service/.gitignore"
write_standard_pom "$OUT/chitfund-reporting-service" "reporting-service" "Reporting Service" "$KAFKA_DEP" "false"
init_repo "$OUT/chitfund-reporting-service"

# ─────────────────────────────────────────
# 9. audit-service
# ─────────────────────────────────────────
echo "==> chitfund-audit-service"
mkdir -p "$OUT/chitfund-audit-service"
cp -r "$MONO/audit-service/src" "$OUT/chitfund-audit-service/"
[ -f "$MONO/audit-service/Dockerfile" ] && cp "$MONO/audit-service/Dockerfile" "$OUT/chitfund-audit-service/"
printf '%s' "$GITIGNORE" > "$OUT/chitfund-audit-service/.gitignore"
write_standard_pom "$OUT/chitfund-audit-service" "audit-service" "Audit Service" "$KAFKA_DEP" "false"
init_repo "$OUT/chitfund-audit-service"

# ─────────────────────────────────────────
# 10. api-gateway  (Spring Cloud Gateway — reactive, different pom structure)
# ─────────────────────────────────────────
echo "==> chitfund-api-gateway"
mkdir -p "$OUT/chitfund-api-gateway"
cp -r "$MONO/api-gateway/src" "$OUT/chitfund-api-gateway/"
[ -f "$MONO/api-gateway/Dockerfile" ] && cp "$MONO/api-gateway/Dockerfile" "$OUT/chitfund-api-gateway/"
printf '%s' "$GITIGNORE" > "$OUT/chitfund-api-gateway/.gitignore"

cat > "$OUT/chitfund-api-gateway/pom.xml" << 'POMEOF'
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.5</version>
    <relativePath/>
  </parent>

  <groupId>com.chitfund</groupId>
  <artifactId>api-gateway</artifactId>
  <version>1.0.0-SNAPSHOT</version>
  <packaging>jar</packaging>
  <name>API Gateway</name>

  <properties>
    <java.version>21</java.version>
    <spring-cloud.version>2023.0.1</spring-cloud.version>
  </properties>

  <dependencyManagement>
    <dependencies>
      <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-dependencies</artifactId>
        <version>${spring-cloud.version}</version>
        <type>pom</type>
        <scope>import</scope>
      </dependency>
    </dependencies>
  </dependencyManagement>

  <dependencies>
    <dependency>
      <groupId>org.springframework.cloud</groupId>
      <artifactId>spring-cloud-starter-gateway</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-actuator</artifactId>
    </dependency>
    <dependency>
      <groupId>io.jsonwebtoken</groupId>
      <artifactId>jjwt-api</artifactId>
      <version>0.12.5</version>
    </dependency>
    <dependency>
      <groupId>io.jsonwebtoken</groupId>
      <artifactId>jjwt-impl</artifactId>
      <version>0.12.5</version>
      <scope>runtime</scope>
    </dependency>
    <dependency>
      <groupId>io.jsonwebtoken</groupId>
      <artifactId>jjwt-jackson</artifactId>
      <version>0.12.5</version>
      <scope>runtime</scope>
    </dependency>
    <dependency>
      <groupId>org.projectlombok</groupId>
      <artifactId>lombok</artifactId>
      <optional>true</optional>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
        <configuration>
          <excludes>
            <exclude>
              <groupId>org.projectlombok</groupId>
              <artifactId>lombok</artifactId>
            </exclude>
          </excludes>
        </configuration>
      </plugin>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <configuration>
          <source>21</source>
          <target>21</target>
          <annotationProcessorPaths>
            <path>
              <groupId>org.projectlombok</groupId>
              <artifactId>lombok</artifactId>
              <version>1.18.32</version>
            </path>
          </annotationProcessorPaths>
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>
POMEOF

init_repo "$OUT/chitfund-api-gateway"

# ─────────────────────────────────────────
# Summary
# ─────────────────────────────────────────
echo ""
echo "All done! Standalone repos created:"
for d in chitfund-common chitfund-user-service chitfund-member-service chitfund-chit-service \
          chitfund-payment-service chitfund-payout-service chitfund-notification-service \
          chitfund-reporting-service chitfund-audit-service chitfund-api-gateway; do
  branches=$(git -C "$OUT/$d" branch 2>/dev/null | tr '\n' ' ')
  echo "  $OUT/$d  [$branches]"
done
