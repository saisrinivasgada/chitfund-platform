# Private staging access guide

The staging site is intentionally unreachable from the public Internet. A
person needs both an approved Tailscale identity/device and an ordinary ChitWise
staging login.

## Your first connection

1. Install the official Tailscale app on the Mac, iPhone or test device.
2. Sign in to the same Tailscale account that owns the staging server.
3. Approve the device in the Tailscale admin console and keep device approval
   enabled.
4. Connect Tailscale, then open `https://staging.thechitwise.com`.
5. Disconnect Tailscale and retry. The site must no longer connect. That is the
   public-inaccessibility test, not an error.

Tailscale protects the network path; ChitWise authentication and tenant/role
authorization still protect application data.

## Give one external tester access

Use Tailscale's **Share machine** feature for the single
`chitwise-staging` machine. Invite the tester's email address. This is better
than adding a temporary tester to the whole company tailnet because the shared
person sees only that machine.

Then create a synthetic ChitWise staging user with only the role and tenant the
tester needs. Never send AWS, database or GitHub credentials.

To revoke access, remove the machine share and revoke the ChitWise staging
session/user. Either control alone blocks access; removing both closes the
network and application layers.

## Give a future employee access

1. Invite the employee's company email to the Tailscale organization.
2. Require MFA and device approval.
3. Put the employee in a `staging-testers` group.
4. Permit that group to reach only the tagged staging node on TCP 443.
5. Give GitHub repository access separately according to the employee's job.
6. Do not grant AWS Console, RDS or production access for ordinary development
   and QA work.

A suitable Tailscale policy shape is:

```json
{
  "groups": {
    "group:staging-testers": ["employee@your-company.example"]
  },
  "tagOwners": {
    "tag:chitwise-staging": ["autogroup:admin"]
  },
  "grants": [
    {
      "src": ["group:staging-testers"],
      "dst": ["tag:chitwise-staging"],
      "ip": ["tcp:443"]
    }
  ]
}
```

Replace the example email before saving. Preserve any existing Tailscale policy
rules; do not overwrite the full policy with this fragment.

## What each person receives

| Person | Tailscale | ChitWise staging account | GitHub | AWS |
|---|---|---|---|---|
| Owner | Admin | Platform owner | Owner | Owner/admin |
| Developer | Member, TCP 443 only | Role needed for feature testing | Repository contributor | None by default |
| QA tester | Shared staging machine | Limited synthetic test role | Optional/read-only | None |
| Client demo viewer | Temporary shared machine | Demo tenant only | None | None |

## Connection checks

After granting access:

- With Tailscale connected, HTTPS loads with a valid certificate.
- With Tailscale disconnected, public HTTPS times out or is refused.
- Port 22 and MySQL 3306 remain unreachable from the tester device.
- A tester can access only their assigned synthetic tenant and role.
- Removing the share/device immediately removes network access.

Do not solve a connection issue by opening ports 80, 443, 22 or 3306 to
`0.0.0.0/0`. Check the Tailscale device approval, machine share/ACL, staging
instance state and ChitWise account instead.
