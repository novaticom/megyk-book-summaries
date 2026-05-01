-- Migration 026: Add capped monthly credit reset helper

CREATE OR REPLACE FUNCTION apply_monthly_credit_reset(
  p_user_id UUID,
  p_amount INTEGER,
  p_cycle_key TEXT,
  p_description TEXT DEFAULT 'Monthly credit reset'
)
RETURNS JSONB AS $$
DECLARE
  v_balance credit_balances%ROWTYPE;
  v_reset_amount INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Monthly reset amount must be positive';
  END IF;

  SELECT *
  INTO v_balance
  FROM public.credit_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit balance not found for user %', p_user_id;
  END IF;

  v_reset_amount := LEAST(v_balance.current_balance, p_amount);

  IF v_reset_amount <= 0 THEN
    RETURN NULL;
  END IF;

  RETURN create_credit_transaction(
    p_user_id,
    -v_reset_amount,
    'monthly_reset',
    NULL,
    'monthly_credit_cycle',
    p_description,
    jsonb_build_object(
      'cycle_key', p_cycle_key,
      'monthly_amount', p_amount,
      'applied_reset_amount', v_reset_amount
    ),
    format('monthly-reset:%s', p_cycle_key),
    true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
