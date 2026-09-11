#!/bin/sh
set -eu

for queue in \
  chitfund-notification-events \
  chitfund-audit-events \
  chitfund-reporting-events
do
  awslocal sqs create-queue --queue-name "$queue" >/dev/null
done
