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

# Keep signing evidence outside replaceable hosts, images and client bundles.
export AWS_REGION="$REGION"
export CHITWISE_OFFLINE_SECRET_ID="${CHITWISE_OFFLINE_SECRET_ID:-${SECRET_ID}/offline-signing}"
config_dir="$(dirname "$ENV_FILE")"
install -d -m 0750 "$config_dir"
umask 077
task_env_tmp="$(mktemp "$config_dir/.chitwise-env.XXXXXX")"
trap 'rm -f "$task_env_tmp"' EXIT
aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ID" \
  --region "$REGION" \
  --query SecretString \
  --output text | python3 "$(dirname "$0")/prepare-offline-config.py" > "$task_env_tmp"
chmod 600 "$task_env_tmp"
mv -f "$task_env_tmp" "$ENV_FILE"
echo "Production configuration validated and written securely."
