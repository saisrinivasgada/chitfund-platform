CREATE TABLE admin_wallet (
  id            VARCHAR(36)    NOT NULL PRIMARY KEY,
  account_type  ENUM('CASH','BANK') NOT NULL,
  entry_type    ENUM('IN','OUT')    NOT NULL,
  amount        DECIMAL(12,2)  NOT NULL,
  category      VARCHAR(100),
  description   TEXT,
  created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by    VARCHAR(36)    NOT NULL
);
