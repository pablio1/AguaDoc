-- Restock history & activity logs for Inventory Monitor
USE aguadoc;

CREATE TABLE IF NOT EXISTS restock_logs (
  id            VARCHAR(36)    NOT NULL PRIMARY KEY,
  stockItemId   VARCHAR(32)    NOT NULL,
  itemName      VARCHAR(255)   NOT NULL,
  category      VARCHAR(100)   NOT NULL DEFAULT '',
  quantityAdded INT            NOT NULL,
  stockBefore   INT            NOT NULL,
  stockAfter    INT            NOT NULL,
  performedBy   VARCHAR(255)   NOT NULL DEFAULT 'Admin',
  note          VARCHAR(500)   NULL,
  createdAt     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_restock_created (createdAt),
  KEY idx_restock_item (stockItemId),
  CONSTRAINT fk_restock_stock_item
    FOREIGN KEY (stockItemId) REFERENCES stock_items(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
