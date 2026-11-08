-- CinetPay aggregator (cahier des charges p. 25): fallback and other Mobile Money operators.
ALTER TABLE payments DROP CONSTRAINT payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (method IN ('orange_money', 'mtn_momo', 'cinetpay', 'stripe'));
