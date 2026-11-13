-- Track whether an order already deducted stock / tank water (idempotent fulfill)
USE aguadoc;

ALTER TABLE orders
  ADD COLUMN inventoryConsumedAt DATETIME NULL AFTER paymentStatus;
