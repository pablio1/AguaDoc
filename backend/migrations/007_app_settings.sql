-- Admin-configurable integrations (Xendit/GCash + Semaphore SMS)
USE aguadoc;

CREATE TABLE IF NOT EXISTS app_settings (
  settingKey   VARCHAR(100)  NOT NULL PRIMARY KEY,
  settingValue TEXT          NULL,
  updatedAt    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updatedBy    VARCHAR(255)  NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
