-- Stock catalog for Inventory Monitor (containers, refills, accessories)
USE aguadoc;

CREATE TABLE IF NOT EXISTS stock_items (
  id          VARCHAR(32)    NOT NULL PRIMARY KEY,
  name        VARCHAR(255)   NOT NULL,
  category    VARCHAR(100)   NOT NULL,
  stock       INT            NOT NULL DEFAULT 0,
  minAlert    INT            NOT NULL DEFAULT 0,
  unitPrice   DECIMAL(12, 2) NOT NULL DEFAULT 0,
  unit        VARCHAR(40)    NOT NULL DEFAULT 'units',
  updatedAt   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  createdAt   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_stock_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO stock_items (id, name, category, stock, minAlert, unitPrice, unit) VALUES
  ('stk-gal-slim',   'Gallon Container (Slim/Round)',     'Containers',   45,  10, 200.00, 'units'),
  ('stk-gal-square', 'Gallon Container (Square)',         'Containers',   20,   5, 220.00, 'units'),
  ('stk-ref-slim',   'Purified Water Refill (Slim/Round)','Water Refill', 350,  50,  25.00, 'units'),
  ('stk-ref-square', 'Purified Water Refill (Square)',    'Water Refill', 150,  30,  30.00, 'units'),
  ('stk-caps',       'Bottle Caps & Sealing Plastics',    'Accessories',  800, 100,   5.00, 'units')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  category = VALUES(category),
  minAlert = VALUES(minAlert),
  unitPrice = VALUES(unitPrice),
  unit = VALUES(unit);
