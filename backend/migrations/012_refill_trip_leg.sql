-- Two-way refill trip: pickup empty jug → station → deliver filled jug
USE aguadoc;

ALTER TABLE orders
  ADD COLUMN tripLeg VARCHAR(32) NULL AFTER productLabel;
