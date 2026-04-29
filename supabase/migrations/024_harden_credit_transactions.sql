-- Migration 024: Harden credit transactions with DB-authoritative balance math

-- =============================================
-- Function: create_credit_transaction
-- Atomically computes balance_before / balance_after in the DB
-- =============================================
CREATE OR REPLACE FUNCTION create_credit_transaction(
  p_user_id UUID,
  p_amount INTEGER,
  p_transaction_type credit_transaction_type,
  p_reference_id UUID DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_enforce_actor BOOLEAN DEFAULT true
)
RETURNS JSONB AS $$
DECLARE
  v_balance credit_balances%ROWTYPE;
  v_transaction credit_transactions%ROWTYPE;
  v_balance_before INTEGER;
  v_balance_after INTEGER;
BEGIN
  IF p_enforce_actor
     AND auth.role() <> 'service_role'
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized credit mutation for user %', p_user_id;
  END IF;

  SELECT *
  INTO v_balance
  FROM public.credit_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit balance not found for user %', p_user_id;
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


-- =============================================
-- Function: deduct_credits
-- Wrapper for negative credit movements
-- =============================================
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_transaction_type credit_transaction_type,
  p_reference_id UUID DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
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
    true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================
-- Function: add_credits
-- Wrapper for positive credit movements
-- =============================================
CREATE OR REPLACE FUNCTION add_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_transaction_type credit_transaction_type,
  p_reference_id UUID DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
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
    true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
