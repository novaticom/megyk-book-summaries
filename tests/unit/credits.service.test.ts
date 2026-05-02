import test from 'node:test'
import assert from 'node:assert/strict'
import { CreditService } from '@/lib/services/credits'

type RpcCall = {
  name: string
  args: Record<string, unknown>
}

function createMockSupabase({
  rpcResult,
  rpcError = null,
  fromResult,
  fromError = null,
}: {
  rpcResult: unknown
  rpcError?: unknown
  fromResult?: unknown
  fromError?: unknown
}) {
  const calls: RpcCall[] = []
  const fromCalls: Array<{ table: string; filters: Array<{ type: string; args: unknown[] }> }> = []

  const buildQuery = (table: string) => {
    const state = {
      table,
      filters: [] as Array<{ type: string; args: unknown[] }>,
    }
    fromCalls.push(state)

    const query = {
      select: (...args: unknown[]) => {
        state.filters.push({ type: 'select', args })
        return query
      },
      eq: (...args: unknown[]) => {
        state.filters.push({ type: 'eq', args })
        return query
      },
      is: (...args: unknown[]) => {
        state.filters.push({ type: 'is', args })
        return query
      },
      single: async () => ({ data: fromResult, error: fromError }),
    }

    return query
  }

  return {
    calls,
    fromCalls,
    client: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args })
        return { data: rpcResult, error: rpcError }
      },
      from: (table: string) => buildQuery(table),
    },
  }
}

test('deductCredits uses the hardened deduct_credits RPC', async () => {
  const transaction = {
    id: 'tx-1',
    user_id: 'user-1',
    amount: -10,
    transaction_type: 'chat_message',
    idempotency_key: 'chat:req-1',
    reference_id: 'session-1',
    reference_type: 'chat_session',
    description: 'Chat message',
    balance_before: 100,
    balance_after: 90,
    metadata: { book_id: 'book-1' },
    created_at: '2026-04-29T00:00:00.000Z',
  }

  const { client, calls } = createMockSupabase({ rpcResult: transaction })
  const service = new CreditService(client as never)

  const result = await service.deductCredits(
    'user-1',
    10,
    'chat_message',
    'session-1',
    'chat_session',
    'Chat message',
    { book_id: 'book-1' },
    'chat:req-1'
  )

  assert.deepEqual(result, transaction)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'deduct_credits')
  assert.deepEqual(calls[0].args, {
    p_user_id: 'user-1',
    p_amount: 10,
    p_transaction_type: 'chat_message',
    p_reference_id: 'session-1',
    p_reference_type: 'chat_session',
    p_description: 'Chat message',
    p_metadata: { book_id: 'book-1' },
    p_idempotency_key: 'chat:req-1',
  })
})

test('addCredits uses the hardened add_credits RPC', async () => {
  const transaction = {
    id: 'tx-2',
    user_id: 'user-1',
    amount: 500,
    transaction_type: 'admin_adjustment',
    idempotency_key: 'grant:req-1',
    reference_id: null,
    reference_type: null,
    description: 'Manual grant',
    balance_before: 100,
    balance_after: 600,
    metadata: { reason: 'support' },
    created_at: '2026-04-29T00:00:00.000Z',
  }

  const { client, calls } = createMockSupabase({ rpcResult: transaction })
  const service = new CreditService(client as never)

  const result = await service.addCredits(
    'user-1',
    500,
    'admin_adjustment',
    undefined,
    undefined,
    'Manual grant',
    { reason: 'support' },
    'grant:req-1'
  )

  assert.deepEqual(result, transaction)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'add_credits')
  assert.deepEqual(calls[0].args, {
    p_user_id: 'user-1',
    p_amount: 500,
    p_transaction_type: 'admin_adjustment',
    p_reference_id: null,
    p_reference_type: null,
    p_description: 'Manual grant',
    p_metadata: { reason: 'support' },
    p_idempotency_key: 'grant:req-1',
  })
})

test('deductCredits returns null when the RPC fails', async () => {
  const { client } = createMockSupabase({
    rpcResult: null,
    rpcError: { message: 'Insufficient credits' },
  })
  const service = new CreditService(client as never)

  const result = await service.deductCredits('user-1', 10, 'chat_message')

  assert.equal(result, null)
})

test('getCreditCost prefers the database value for summary pricing', async () => {
  const { client, fromCalls } = createMockSupabase({
    rpcResult: null,
    fromResult: { cost: 345 },
  })
  const service = new CreditService(client as never)

  const cost = await service.getCreditCost('summary', 'narrative', 'medium')

  assert.equal(cost, 345)
  assert.equal(fromCalls.length, 1)
  assert.equal(fromCalls[0].table, 'credit_costs')
})

test('getCreditCost falls back to constants when the database lookup fails', async () => {
  const { client } = createMockSupabase({
    rpcResult: null,
    fromResult: null,
    fromError: { message: 'not found' },
  })
  const service = new CreditService(client as never)

  const summaryCost = await service.getCreditCost('summary', 'workbook', 'long')
  const chatCost = await service.getCreditCost('chat_message')

  assert.equal(summaryCost, 800)
  assert.equal(chatCost, 10)
})

test('grantMonthlyAllocation uses an idempotent monthly allocation key', async () => {
  const transaction = {
    id: 'tx-3',
    user_id: 'user-1',
    amount: 500,
    transaction_type: 'monthly_allocation',
    idempotency_key: 'monthly-allocation:2026-05',
    reference_id: null,
    reference_type: 'monthly_credit_cycle',
    description: 'Monthly credit allocation',
    balance_before: 100,
    balance_after: 600,
    metadata: { cycle_key: '2026-05', monthly_amount: 500 },
    created_at: '2026-04-29T00:00:00.000Z',
  }

  const { client, calls } = createMockSupabase({ rpcResult: transaction })
  const service = new CreditService(client as never)

  const result = await service.grantMonthlyAllocation('user-1', 500, '2026-05')

  assert.deepEqual(result, transaction)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'add_credits')
  assert.deepEqual(calls[0].args, {
    p_user_id: 'user-1',
    p_amount: 500,
    p_transaction_type: 'monthly_allocation',
    p_reference_id: null,
    p_reference_type: 'monthly_credit_cycle',
    p_description: 'Monthly credit allocation',
    p_metadata: { cycle_key: '2026-05', monthly_amount: 500 },
    p_idempotency_key: 'monthly-allocation:2026-05',
  })
})

test('applyMonthlyReset uses an idempotent monthly reset key', async () => {
  const transaction = {
    id: 'tx-4',
    user_id: 'user-1',
    amount: -500,
    transaction_type: 'monthly_reset',
    idempotency_key: 'monthly-reset:2026-05',
    reference_id: null,
    reference_type: 'monthly_credit_cycle',
    description: 'Monthly credit reset',
    balance_before: 600,
    balance_after: 100,
    metadata: { cycle_key: '2026-05', monthly_amount: 500 },
    created_at: '2026-04-29T00:00:00.000Z',
  }

  const { client, calls } = createMockSupabase({ rpcResult: transaction })
  const service = new CreditService(client as never)

  const result = await service.applyMonthlyReset('user-1', 500, '2026-05')

  assert.deepEqual(result, transaction)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'deduct_credits')
  assert.deepEqual(calls[0].args, {
    p_user_id: 'user-1',
    p_amount: 500,
    p_transaction_type: 'monthly_reset',
    p_reference_id: null,
    p_reference_type: 'monthly_credit_cycle',
    p_description: 'Monthly credit reset',
    p_metadata: { cycle_key: '2026-05', monthly_amount: 500 },
    p_idempotency_key: 'monthly-reset:2026-05',
  })
})

test('applyCappedMonthlyReset uses the monthly reset helper RPC', async () => {
  const transaction = {
    id: 'tx-5',
    user_id: 'user-1',
    amount: -120,
    transaction_type: 'monthly_reset',
    idempotency_key: 'monthly-reset:2026-05',
    reference_id: null,
    reference_type: 'monthly_credit_cycle',
    description: 'Monthly credit reset',
    balance_before: 120,
    balance_after: 0,
    metadata: {
      cycle_key: '2026-05',
      monthly_amount: 500,
      applied_reset_amount: 120,
    },
    created_at: '2026-04-29T00:00:00.000Z',
  }

  const { client, calls } = createMockSupabase({ rpcResult: transaction })
  const service = new CreditService(client as never)

  const result = await service.applyCappedMonthlyReset('user-1', 500, '2026-05')

  assert.deepEqual(result, transaction)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'apply_monthly_credit_reset')
  assert.deepEqual(calls[0].args, {
    p_user_id: 'user-1',
    p_amount: 500,
    p_cycle_key: '2026-05',
    p_description: 'Monthly credit reset',
  })
})
