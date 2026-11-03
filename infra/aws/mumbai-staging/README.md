# ChitWise private Mumbai staging

This directory defines the internal staging environment in `ap-south-1`. It is
fed only by the GitHub `test` branch and is isolated from production at the
network, database, secret, queue and image-tag layers.

## Security boundary

- The EC2 security group exposes **no public TCP ports**: no HTTP, HTTPS, SSH,
  database or application port.
- Testers reach HTTPS through Tailscale's encrypted network. The only public
  inbound rule is UDP 41641, which Tailscale uses for authenticated encrypted
  peer traffic; it does not expose an application protocol.
- The EC2 instance has a public egress address because it must pull containers,
  security updates and reach AWS APIs. A public IP does not make the web app
  public when its security group has no TCP ingress.
- RDS is private, encrypted, non-Multi-AZ and accepts MySQL only from the
  staging application security group.
- Administration uses AWS Systems Manager. SSH keys and port 22 are not used.
- GitHub uses short-lived OIDC credentials. Its role trusts only this repository
  and the `test` branch.
- External email, SMS and WhatsApp delivery is disabled. Staging uses synthetic
  people and financial data only.

## Isolation from production

- VPC CIDR: `10.30.0.0/16`
- Secret: `chitwise/staging`
- Durable offline key: `chitwise/staging/offline-signing`
- Database: `chitwise-staging-db`
- Image tag: `staging-<full Git commit SHA>`
- Queue prefix: `staging-`
- Deployment workflow source: `refs/heads/test`

The application must never omit `SQS_QUEUE_PREFIX` in staging. Without the
prefix, a publisher or consumer could touch production queues in the shared AWS
account. IAM also restricts the instance to `staging-chitfund-*` queue ARNs.

## Low-cost behavior

- One `t3.medium` EC2 host with encrypted gp3 storage and 4 GiB low-swappiness
  swap runs all containers.
- One private `db.t4g.micro` MySQL 8.4 RDS instance stores staging data.
- Only three consolidated source queues are polled. They use the maximum
  20-second SQS long poll, one consumer at a time and batches up to 10 messages.
  Idle staging polling therefore stays below the SQS free request tier.
- EC2 and RDS start daily at 08:45 and 08:30 IST respectively. EC2 stops at
  22:00 IST and RDS stops at 22:15 IST. They may be started manually for testing
  outside that window.
- Release bundles expire from S3 after 30 days.

## Deployment flow

1. A feature PR targets `test`.
2. CI compiles and tests changed services. Financial changes also run the
   disposable MySQL 8 + SQS suite.
3. After the PR is merged, the `test` push builds a complete immutable staging
   backend release and a frontend bundle.
4. GitHub assumes the staging-only AWS role through OIDC.
5. AWS Systems Manager runs `scripts/deploy-staging.sh` on the private host.
6. The script checks failed Flyway history, creates only missing empty schemas,
   pulls the immutable images, waits for health checks and runs local HTTPS
   smoke checks.

No staging workflow can deploy production, and no pull-request event deploys
staging.

## Certificate renewal

The staging certificate covers `staging.thechitwise.com` and
`*.staging.thechitwise.com`. Certbot uses DNS validation through the existing
protected GoDaddy credential. The credential is materialized under `/run` only
during issuance/renewal and is then removed. The system timer renews
automatically.

## Operational rules

- Never use real customer data in staging.
- Never copy production secrets, database snapshots or OTP logs into staging.
- Never edit an applied Flyway migration; add a new migration.
- Do not purge queues to fix a test. Investigate or redrive the message.
- Grant application access through Tailscale, not through AWS credentials or a
  public security-group rule.
- Keep production changes on `main`; staging changes originate from `test`.

See `ACCESS.md` for owner, employee and external tester access procedures.
