-- Item / container type chosen on Request Service (drives stock deductions)
USE aguadoc;

ALTER TABLE orders
  ADD COLUMN productId VARCHAR(50) NULL AFTER type,
  ADD COLUMN productLabel VARCHAR(150) NULL AFTER productId;
