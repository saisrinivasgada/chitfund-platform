#!/usr/bin/env bash
# Attach safe retry/dead-letter behavior to the consolidated Mumbai queues.
# The source queues already exist, so CloudFormation deliberately does not
# attempt to replace or import them. This script is idempotent and never purges
# or deletes messages.
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}"
STACK_NAME="${CHITWISE_STACK_NAME:-chitwise-prod-mumbai}"

configure_queue() {
  local source_name="$1"
  local output_key="$2"
  local source_url dlq_arn redrive attributes

  source_url=$(aws sqs get-queue-url \
    --region "$REGION" \
    --queue-name "$source_name" \
    --query QueueUrl \
    --output text)
  dlq_arn=$(aws cloudformation describe-stacks \
    --region "$REGION" \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='${output_key}'].OutputValue | [0]" \
    --output text)

  if [[ -z "$source_url" || "$source_url" == "None" ]]; then
    echo "Missing required source queue: ${source_name}" >&2
    exit 1
  fi
  if [[ -z "$dlq_arn" || "$dlq_arn" == "None" ]]; then
    echo "Missing CloudFormation output: ${output_key}" >&2
    exit 1
  fi

  redrive=$(printf '{"deadLetterTargetArn":"%s","maxReceiveCount":"5"}' "$dlq_arn")
  attributes=$(jq -cn --arg redrive "$redrive" '{
    SqsManagedSseEnabled: "true",
    ReceiveMessageWaitTimeSeconds: "20",
    VisibilityTimeout: "60",
    MessageRetentionPeriod: "345600",
    RedrivePolicy: $redrive
  }')
  aws sqs set-queue-attributes \
    --region "$REGION" \
    --queue-url "$source_url" \
    --attributes "$attributes"
  aws sqs tag-queue \
    --region "$REGION" \
    --queue-url "$source_url" \
    --tags '{"Application":"ChitWise","Environment":"Production","Region":"Mumbai"}'

  echo "Configured ${source_name}; existing messages were preserved."
}

configure_queue chitfund-audit-events AuditDeadLetterQueueArn
configure_queue chitfund-notification-events NotificationDeadLetterQueueArn
configure_queue chitfund-reporting-events ReportingDeadLetterQueueArn
