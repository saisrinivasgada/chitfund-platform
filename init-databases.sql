-- Run this once on RDS after first boot
-- SSH to EC2, then: mysql -h <RDS_ENDPOINT> -u chitfund -p < init-databases.sql

CREATE DATABASE IF NOT EXISTS chitfund_user         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS chitfund_chit         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS chitfund_member       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS chitfund_payment      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS chitfund_payout       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS chitfund_notification CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS chitfund_audit        CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS chitfund_reporting    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Grant the app user access to all schemas
GRANT ALL PRIVILEGES ON chitfund_user.*         TO 'chitfund'@'%';
GRANT ALL PRIVILEGES ON chitfund_chit.*         TO 'chitfund'@'%';
GRANT ALL PRIVILEGES ON chitfund_member.*       TO 'chitfund'@'%';
GRANT ALL PRIVILEGES ON chitfund_payment.*      TO 'chitfund'@'%';
GRANT ALL PRIVILEGES ON chitfund_payout.*       TO 'chitfund'@'%';
GRANT ALL PRIVILEGES ON chitfund_notification.* TO 'chitfund'@'%';
GRANT ALL PRIVILEGES ON chitfund_audit.*        TO 'chitfund'@'%';
GRANT ALL PRIVILEGES ON chitfund_reporting.*    TO 'chitfund'@'%';
CREATE DATABASE IF NOT EXISTS chitwise_management    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON chitwise_management.*       TO 'chitfund'@'%';
FLUSH PRIVILEGES;
