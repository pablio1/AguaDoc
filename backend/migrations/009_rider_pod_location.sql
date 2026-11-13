-- Per-rider live GPS + proof-of-delivery fields on orders
-- rider_location.id is the rider's user id (legacy "main" row may still exist)
USE aguadoc;

ALTER TABLE orders
  ADD COLUMN deliveredAt DATETIME NULL AFTER inventoryConsumedAt,
  ADD COLUMN podNote TEXT NULL AFTER deliveredAt,
  ADD COLUMN podCashCollected DECIMAL(12, 2) NULL AFTER podNote,
  ADD COLUMN podPhoto MEDIUMTEXT NULL AFTER podCashCollected;
