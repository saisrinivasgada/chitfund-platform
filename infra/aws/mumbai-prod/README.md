# ChitWise Mumbai production rebuild

This directory defines the low-cost production environment in `ap-south-1`.
It intentionally creates a fresh database; it does not copy Ohio production
data.

## Safety properties

- Only ports 80 and 443 are public.
- Port 8080 is bound to loopback on the host and SSH is not exposed.
- Administration uses AWS Systems Manager Session Manager.
- RDS is private, encrypted and reachable only from the application security
  group.
- EC2 storage and deployment artifacts are encrypted.
- Docker Compose is installed as a pinned, checksum-verified plugin because it
  is not included in the Amazon Linux 2023 Docker package.
- The small EC2 host has 4 GiB of persistent swap on its encrypted root volume
  with low swappiness. This protects simultaneous JVM startup while real RAM
  remains preferred; move to `t3.large` before sustained customer traffic.
- The GoDaddy DNS credential is stored in a dedicated Secrets Manager secret.
  Certbot materializes it under `/run` only while renewing and removes it on
  exit; it is not committed or kept in the application environment file.
- The three existing application queues retain their messages and are attached
  to encrypted dead-letter queues by an idempotent configuration script.
- GitHub obtains short-lived AWS credentials through OIDC; no AWS access key is
  stored in GitHub.
- The GitHub role is restricted to this repository's `main` branch.
- SQS and SES are configured for Mumbai. The Mumbai SES domain identity, DKIM
  and production access were verified before cutover. The obsolete Ohio DKIM
  DNS records were removed only after that verification.

## Cost shape

At October 2026 Mumbai on-demand rates, the base environment is approximately
USD 60-70/month before taxes, data transfer and unusual log volume. It does not
include an ALB, NAT Gateway, Multi-AZ RDS, paid support or reserved capacity.

## Creation sequence

1. Confirm the AWS Activate balance, expiry and eligible services in Billing.
2. Create `chitwise/prod` in Mumbai without printing its value. Use a newly
   generated database password and set `AWS_REGION=ap-south-1`.
3. Validate and create the CloudFormation stack with IAM capabilities. The
   stack does not replace the three existing consolidated queues.
4. Run `configure-existing-queues.sh`. It adds retry/dead-letter settings but
   never purges messages; the current reporting messages remain intact.
5. Update the Mumbai secret's `DB_HOST` to the stack's database endpoint.
6. Wait for the EC2 instance to become online in Systems Manager.
7. Transfer the current Certbot state directly from Ohio to Mumbai without its
   credential file. Install `chitwise-certbot`, reissue the apex certificate
   with DNS validation, validate permissions, run `nginx -t`, and verify both
   certificate renewals with `--dry-run`. The enabled systemd timer renews both
   certificates automatically; manual renewal is not part of normal operation.
8. Deploy the current `main` release and initialize all nine empty schemas.
9. Run gateway, browser and mobile smoke tests using a local DNS override.
10. Change the GoDaddy apex, `www`, `hub`, `api`, and wildcard records to the
    Mumbai Elastic IP.
11. Verify HTTPS, WebSockets, tenant subdomains, login and financial flows.
12. After explicit approval, remove the unused Ohio EC2/RDS/SQS/secrets.

## Never commit

- Secret JSON or `.env` files
- Database passwords
- Certbot private keys or `/etc/letsencrypt` archives
- GitHub or AWS access tokens
- Production dumps or member data
