-- AguaDoc initial schema
-- Apply locally:  npm run db:migrate  (from backend/)
-- Or: mysql -u root < migrations/001_init.sql

CREATE DATABASE IF NOT EXISTS aguadoc
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE aguadoc;

CREATE TABLE IF NOT EXISTS users (
  id              VARCHAR(32)  NOT NULL PRIMARY KEY,
  fullName        VARCHAR(255) NOT NULL,
  username        VARCHAR(100) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  password        VARCHAR(255) NOT NULL,
  phone           VARCHAR(50)  NULL,
  address         TEXT         NULL,
  gender          VARCHAR(50)  NULL,
  role            VARCHAR(50)  NOT NULL DEFAULT 'customer',
  termsAcceptedAt DATETIME     NULL,
  termsVersion    VARCHAR(50)  NULL,
  createdAt       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customers (
  id                 VARCHAR(32)    NOT NULL PRIMARY KEY,
  fullName           VARCHAR(255)   NOT NULL,
  email              VARCHAR(255)   NULL,
  phone              VARCHAR(50)    NULL,
  address            TEXT           NULL,
  balance            DECIMAL(12, 2) NOT NULL DEFAULT 0,
  orders             INT            NOT NULL DEFAULT 0,
  agreementSignedAt  DATETIME       NULL,
  remindedAt         DATETIME       NULL,
  createdAt          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id                 VARCHAR(32)    NOT NULL PRIMARY KEY,
  ref                VARCHAR(50)    NULL,
  userId             VARCHAR(32)    NULL,
  type               VARCHAR(100)   NULL,
  quantity           INT            NOT NULL DEFAULT 1,
  status             VARCHAR(50)    NOT NULL DEFAULT 'Pending',
  total              DECIMAL(12, 2) NOT NULL DEFAULT 0,
  address            TEXT           NULL,
  payMethod          VARCHAR(100)   NULL,
  priority           VARCHAR(50)    NULL DEFAULT 'normal',
  notes              TEXT           NULL,
  lat                DOUBLE         NULL,
  lng                DOUBLE         NULL,
  paymentStatus      VARCHAR(50)    NULL,
  checkoutSessionId  VARCHAR(255)   NULL,
  date               DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_orders_userId (userId),
  KEY idx_orders_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id      VARCHAR(32)    NOT NULL PRIMARY KEY,
  custId  VARCHAR(32)    NULL,
  orderId VARCHAR(32)    NULL,
  amount  DECIMAL(12, 2) NOT NULL DEFAULT 0,
  method  VARCHAR(100)   NULL,
  date    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_payments_orderId (orderId),
  KEY idx_payments_custId (custId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id        VARCHAR(32)  NOT NULL PRIMARY KEY,
  audience  VARCHAR(50)  NOT NULL,
  userId    VARCHAR(32)  NULL,
  message   TEXT         NOT NULL,
  type      VARCHAR(50)  NULL,
  `read`    TINYINT(1)   NOT NULL DEFAULT 0,
  createdAt DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notifications_audience_user (audience, userId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory (
  id           INT            NOT NULL PRIMARY KEY,
  waterLevel   DECIMAL(12, 2) NOT NULL DEFAULT 0,
  maxCapacity  DECIMAL(12, 2) NOT NULL DEFAULT 10000,
  readyGallons INT            NOT NULL DEFAULT 0,
  totalGallons INT            NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS containers (
  id         VARCHAR(32)  NOT NULL PRIMARY KEY,
  status     VARCHAR(50)  NOT NULL DEFAULT 'available',
  lastRefill DATETIME     NULL,
  createdAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rider_location (
  id        VARCHAR(32) NOT NULL PRIMARY KEY,
  lat       DOUBLE      NULL,
  lng       DOUBLE      NULL,
  updatedAt DATETIME    NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed singleton rows the API expects
INSERT INTO inventory (id, waterLevel, maxCapacity, readyGallons, totalGallons)
VALUES (1, 1500, 10000, 45, 176)
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO rider_location (id, lat, lng, updatedAt)
VALUES ('main', NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE id = id;
