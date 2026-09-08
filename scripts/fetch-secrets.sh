#!/bin/bash
# Fetches production secrets from AWS Secrets Manager and writes /app/.env
# Requires the EC2 instance role to have secretsmanager:GetSecretValue permission.
set -euo pipefail

SECRET_ID="chitwise/prod"
REGION="us-east-2"
ENV_FILE="/app/.env"

echo "Fetching secrets from AWS Secrets Manager..."

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
