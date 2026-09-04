# ChitWise — Architecture & Scaling Roadmap

## Current Architecture (Single EC2 per Service)

```
Browser / Mobile App
        │
        ▼
   API Gateway (chitfund-api-gateway)
   • JWT validation
   • Route to downstream services
   • Rate limiting (in-memory ConcurrentHashMap — single-instance only)
        │
        ├──► chitfund-user-service        (auth, user management)
        ├──► chitfund-chit-service        (chits, enrollments, winners, auctions)
        ├──► chitfund-payment-service     (draws, payment records, FIFO allocation)
        ├──► chitfund-payout-service      (payouts to winners)
        ├──► chitfund-member-service      (member profiles)
        ├──► chitfund-notification-service
        ├──► chitfund-audit-service
        └──► chitfund-reporting-service

All services share:
  • MySQL (one DB server, separate schemas per service)
  • Kafka (event bus for payment events, draw events)
  • Spring Boot 3.2.5, Java 21
  • chitfund-common (MDC logging, shared DTOs/exceptions)
```

---

## Known Single-Instance Limitations (Fix Before Scaling)

### 1. Gateway Rate Limiter
**Problem:** `ConcurrentHashMap` in API Gateway — state is per-JVM. Two EC2 instances = two independent counters. Each instance allows full quota, so a user with 2 instances can make 2x the requests.

**Fix:** Replace with Redis + token bucket (Bucket4j + Spring Data Redis).
```yaml
# Rate limit key: tenantId:userId → sliding window in Redis
```

### 2. WebSocket Auction Room
**Problem:** Spring `SimpleBroker` is in-memory. If user A connects to instance-1 and user B connects to instance-2, B won't see A's bids.

**Fix:** Replace `SimpleBroker` with RabbitMQ STOMP relay or Redis pub/sub.
```java
// config/WebSocketConfig.java
config.enableStompBrokerRelay("/topic")
    .setRelayHost("rabbitmq-host")
    .setRelayPort(61613);
```

### 3. User-Service Session Cache
**Problem:** Caffeine in-memory cache for session validation. Two instances = two different caches. A logout on instance-1 won't invalidate the cache on instance-2.

**Fix:** Move session blacklist to Redis. JWT expiry is your primary guard; Redis blacklist handles immediate logout.

---

## Scaling Roadmap

### Phase 1 — Multiple EC2 Instances (Current target)

All you need for this phase:
1. **Redis** (ElastiCache `cache.t3.micro` ~$15/mo) — shared state for gateway rate limiting, session blacklist, auction pub/sub
2. **Load Balancer** (ALB) in front of API Gateway — sticky sessions NOT needed if state is in Redis
3. **RDS Multi-AZ** — enable standby replica for MySQL; zero downtime on failover

One Redis instance is enough for all three uses above. Redis is single-threaded for writes but handles thousands of ops/sec — more than enough for a chit fund app.

### Phase 2 — Service Extraction (When One Service Becomes a Bottleneck)

Services most likely to need isolation first, in order:

| Priority | Service | Why |
|----------|---------|-----|
| 1 | payment-service | Highest write volume, most critical FIFO logic |
| 2 | notification-service | Spiky load; can be async-only via Kafka |
| 3 | reporting-service | Read-heavy; could move to read replica |
| 4 | audit-service | Write-only, fire-and-forget; tolerate lag |

When you split, each service gets its own DB schema and its own EC2 Auto Scaling Group. They already communicate via REST + Kafka events, so no redesign needed.

### Phase 3 — Database Scaling

**Read replicas first:** Payment history, reporting queries, member balances are all reads. Route them to a read replica using `@Transactional(readOnly = true)` + a read-only DataSource.

**When to shard:** Only if single-tenant data exceeds ~50M rows. ChitWise already has `tenantId` on every table — tenant-based sharding is a natural cut. Use a proxy like ProxySQL or Vitess at that point.

**Event sourcing for payments (future):** The FIFO allocation logic is append-only by nature. Long term, consider storing `PaymentAllocation` events as the source of truth and deriving balances. This makes auditing trivial and never requires balance recalculation.

### Phase 4 — Multi-Region (Enterprise customers)

Only relevant when you have customers in geographically distant regions with latency requirements. Use Aurora Global Database + region-specific read endpoints. WebSocket auction rooms would need a regional STOMP relay.

---

## Services to Extract Into Separate Microservices (Future)

These are currently baked into existing services but would benefit from extraction:

| Feature | Currently In | Extract To |
|---------|-------------|-----------|
| Auction room | chit-service | auction-service (owns WebSocket, bids, session) |
| Settlement engine | payment-service | settlement-service (complex, stateful) |
| Credit balance | payment-service | credit-service (separate ledger) |
| Cash collection workflow | payment-service | collection-service (worker app specific) |

**Don't extract early.** These are logic boundaries, not load boundaries. Extract only when the owning service becomes too large to reason about or too slow under load.

---

## Logging & Observability Stack

### What's In Place
- **MDC fields** on every log line: `requestId`, `tenantId`, `userId`, `service`, `method`, `path`, `ip`
- **Dev profile:** Colored readable console
- **Prod profile:** JSON via LogstashEncoder — ready for CloudWatch Logs / ELK
- **Structured business logs** on every data-write: chit creation, draw open/close, payment collection/remittance/void, auction open/bid/close, winner assignment, dividend application

### How to Trace a Problem in Production
```
# Find all logs for a specific payment
grep '"batchId":"<UUID>"' /var/log/app.log

# Find everything in one request
grep '"requestId":"<UUID>"' /var/log/app.log

# Find all actions for a tenant
grep '"tenantId":"<TENANT>"' /var/log/app.log

# Find all logs for a user
grep '"userId":"<USER_ID>"' /var/log/app.log

# CloudWatch Logs Insights equivalent
fields @timestamp, service, requestId, message
| filter batchId = "<UUID>"
| sort @timestamp asc
```

### Recommended Additions (When Ready)
1. **Distributed tracing:** Add `spring-cloud-starter-sleuth` (or Micrometer Tracing) + Zipkin/X-Ray. Propagates `traceId` across service-to-service calls so you see the full chain.
2. **Metrics:** Micrometer + CloudWatch Metrics. Key metrics: payment latency, auction bid rate, FIFO application time.
3. **Alerting:** CloudWatch Alarm on `log.error` count > threshold → SNS → PagerDuty/email.

---

## Security Checklist for Multi-Tenant Production

- [x] `tenantId` enforced in every query via `TenantContext`
- [x] X-Internal-Key on cross-service internal endpoints (payment dividend apply)
- [x] JWT expiry + role-based controller access
- [ ] Rotate JWT secret independently per tenant (future)
- [ ] Encrypt PII fields at rest (member phone, address) — use JPA `AttributeConverter` + AES
- [ ] Enable RDS encryption at rest (one toggle in AWS console)
- [ ] VPC private subnets — DB and internal services should not be publicly accessible

---

## Quick Reference — Service Ports

| Service | Default Port |
|---------|-------------|
| api-gateway | 8080 |
| user-service | 8081 |
| chit-service | 8082 |
| payment-service | 8083 |
| payout-service | 8084 |
| member-service | 8085 |
| notification-service | 8086 |
| audit-service | 8087 |
| reporting-service | 8088 |
