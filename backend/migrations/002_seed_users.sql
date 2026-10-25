-- Seed login users for staff + customer.
-- Rider seed lives in 003_rider_role.sql.
-- Safe to re-run (unique email/username + ON DUPLICATE KEY).

USE aguadoc;

INSERT INTO users (
  id, fullName, username, email, password, phone, address, gender, role,
  termsAcceptedAt, termsVersion, createdAt
) VALUES
  (
    'seed-staff-001',
    'AguaDoc Admin',
    'admin',
    'admin@aguadoc.com',
    'admin123',
    '09000000001',
    'Lapu-Lapu City, Cebu',
    'Other',
    'staff',
    NOW(),
    '1.0',
    NOW()
  ),
  (
    'seed-customer-001',
    'Demo Customer',
    'customer',
    'customer@aguadoc.com',
    'customer123',
    '09000000002',
    'Basak, Lapu-Lapu City, Cebu',
    'Other',
    'customer',
    NOW(),
    '1.0',
    NOW()
  )
ON DUPLICATE KEY UPDATE
  fullName = VALUES(fullName),
  password = VALUES(password),
  role     = VALUES(role);

-- Link demo customer so they show up under Customers in the admin panel
INSERT INTO customers (id, fullName, email, phone, address, balance, orders, createdAt)
VALUES (
  'seed-customer-001',
  'Demo Customer',
  'customer@aguadoc.com',
  '09000000002',
  'Basak, Lapu-Lapu City, Cebu',
  0,
  0,
  NOW()
)
ON DUPLICATE KEY UPDATE
  fullName = VALUES(fullName),
  email    = VALUES(email),
  phone    = VALUES(phone),
  address  = VALUES(address);
