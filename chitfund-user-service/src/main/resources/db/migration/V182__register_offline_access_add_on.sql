-- Register the product option without changing any existing plan or tenant access.
INSERT IGNORE INTO plan_add_on_defs (`key`, label, sort_order)
VALUES ('offline_support', 'Offline access & sync', 5);
