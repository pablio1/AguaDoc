-- Split combined "Bottle Caps & Sealing Plastics" into separate stock items
USE aguadoc;

-- 1) Rename existing combined accessory (keep id so restock_logs FK stays valid)
UPDATE stock_items
SET
  name = 'Bottle Caps',
  category = 'Accessories',
  minAlert = 100,
  unitPrice = 5.00,
  unit = 'units'
WHERE id = 'stk-caps';

-- 2) Ensure Bottle Caps row exists (fresh DBs that somehow skipped it)
INSERT INTO stock_items (id, name, category, stock, minAlert, unitPrice, unit)
VALUES ('stk-caps', 'Bottle Caps', 'Accessories', 500, 100, 5.00, 'units')
ON DUPLICATE KEY UPDATE
  name = 'Bottle Caps',
  category = 'Accessories',
  minAlert = 100,
  unitPrice = 5.00,
  unit = 'units';

-- 3) Add Sealing Plastics as its own row (do not overwrite stock on re-run)
INSERT INTO stock_items (id, name, category, stock, minAlert, unitPrice, unit)
VALUES ('stk-seals', 'Sealing Plastics', 'Accessories', 300, 80, 3.00, 'units')
ON DUPLICATE KEY UPDATE
  name = 'Sealing Plastics',
  category = 'Accessories',
  minAlert = 80,
  unitPrice = 3.00,
  unit = 'units';
