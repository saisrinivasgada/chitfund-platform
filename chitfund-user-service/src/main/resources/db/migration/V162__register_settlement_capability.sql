-- Settlement existed before plan capability enforcement. Register it in the
-- capability catalogue and preserve access for every existing plan so this
-- additive rollout cannot unexpectedly disable a live financial workflow.
-- Super administrators can change plan capabilities after deployment.
INSERT IGNORE INTO plan_capability_defs (`key`, label, sort_order)
VALUES ('settlement', 'Member early-exit settlement', 4);

UPDATE plan_limits
SET capabilities = JSON_ARRAY_APPEND(COALESCE(capabilities, '[]'), '$', 'settlement')
WHERE NOT JSON_CONTAINS(COALESCE(capabilities, '[]'), '"settlement"', '$');
