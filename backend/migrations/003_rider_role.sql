-- Rider role: assignable deliveries + seed rider account
USE aguadoc;

-- Assignable rider on each order (ignore error if column already exists when re-running)
ALTER TABLE orders ADD COLUMN riderId VARCHAR(32) NULL AFTER userId;

INSERT INTO users (
  id, fullName, username, email, password, phone, address, gender, role,
  termsAcceptedAt, termsVersion, createdAt
) VALUES (
  'seed-rider-001',
  'Demo Rider',
  'rider',
  'rider@aguadoc.com',
  'rider123',
  '09000000003',
  'Lapu-Lapu City, Cebu',
  'Other',
  'rider',
  NOW(),
  '1.0',
  NOW()
)
ON DUPLICATE KEY UPDATE
  fullName = VALUES(fullName),
  password = VALUES(password),
  role     = VALUES(role);
