-- Normalize debt balances to 2 decimal places
USE aguadoc;

UPDATE customers
SET balance = ROUND(balance, 2)
WHERE balance IS NOT NULL;
