#!/bin/bash
# Fetches production secrets from AWS Secrets Manager and writes /app/.env
# Requires the EC2 instance role to have secretsmanager:GetSecretValue permission.
set -euo pipefail

# Region and secret selection are host configuration, not secret values. The
# Mumbai instance writes this root-owned file during bootstrap. Reading it here
# prevents a new host from silently falling back to the Ohio secret.
if [[ -r /etc/chitwise-environment ]]; then
  # shellcheck disable=SC1091
  source /etc/chitwise-environment
fi

SECRET_ID="${CHITWISE_SECRET_ID:-chitwise/prod}"
REGION="${AWS_REGION:-ap-south-1}"
ENV_FILE="${CHITWISE_ENV_FILE:-/app/.env}"

echo "Fetching production configuration from Secrets Manager in ${REGION}..."

aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ID" \
  --region "$REGION" \
  --query SecretString \
  --output text | \
python3 -c "
import sys, json
data = json.load(sys.stdin)
for k, v in data.items():
    # Escape any newlines in values
    v = str(v).replace('\n', '\\n')
    print(f'{k}={v}')
" > "$ENV_FILE"

chmod 600 "$ENV_FILE"
echo "Secrets written to $ENV_FILE ($(wc -l < "$ENV_FILE") keys)"
