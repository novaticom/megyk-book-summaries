-- Migration 025: Add idempotent credit mutations and monthly reset transaction types

ALTER TYPE credit_transaction_type ADD VALUE IF NOT EXISTS 'monthly_allocation';
ALTER TYPE credit_transaction_type ADD VALUE IF NOT EXISTS 'monthly_reset';

ALTER TABLE credit_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_user_idempotency
  ON credit_transactions(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION create_credit_transaction(
  p_user_id UUID,
  p_amount INTEGER,
  p_transaction_type credit_transaction_type,
  p_reference_id UUID DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_idempotency_key TEXT DEFAULT NULL,
  p_enforce_actor BOOLEAN DEFAULT true
)
RETURNS JSONB AS $$
DECLARE
  v_balance credit_balances%ROWTYPE;
  v_transaction credit_transactions%ROWTYPE;
  v_existing_transaction credit_transactions%ROWTYPE;
  v_balance_before INTEGER;
  v_balance_after INTEGER;
BEGIN
  IF p_enforce_actor
     AND auth.role() <> 'service_role'
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized credit mutation for user %', p_user_id;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT *
    INTO v_existing_transaction
    FROM public.credit_transactions
    WHERE user_id = p_user_id
      AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN to_jsonb(v_existing_transaction);
    END IF;
  END IF;

  SELECT *
  INTO v_balance
  FROM public.credit_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit balance not found for user %', p_user_id;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT *
    INTO v_existing_transaction
    FROM public.credit_transactions
    WHERE user_id = p_user_id
      AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN to_jsonb(v_existing_transaction);
    END IF;
  END IF;

  v_balance_before := v_balance.current_balance;
  v_balance_after := v_balance_before + p_amount;

  IF v_balance_after < 0 THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    transaction_type,
    idempotency_key,
    reference_id,
    reference_type,
    description,
    balance_before,
    balance_after,
    metadata
  ) VALUES (
    p_user_id,
    p_amount,
    p_transaction_type,
    p_idempotency_key,
    p_reference_id,
    p_reference_type,
    p_description,
    v_balance_before,
    v_balance_after,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING *
  INTO v_transaction;

  RETURN to_jsonb(v_transaction);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_transaction_type credit_transaction_type,
  p_reference_id UUID DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Deduction amount must be positive';
  END IF;

  RETURN create_credit_transaction(
    p_user_id,
    -p_amount,
    p_transaction_type,
    p_reference_id,
    p_reference_type,
    p_description,
    p_metadata,
    p_idempotency_key,
    true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION add_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_transaction_type credit_transaction_type,
  p_reference_id UUID DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be positive';
  END IF;

  RETURN create_credit_transaction(
    p_user_id,
    p_amount,
    p_transaction_type,
    p_reference_id,
    p_reference_type,
    p_description,
    p_metadata,
    p_idempotency_key,
    true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
