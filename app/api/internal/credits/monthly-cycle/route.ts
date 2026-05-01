import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCreditService } from '@/lib/services/credits'

type MonthlyCycleRequest = {
  cycle_key?: string
  monthly_amount?: number
  dry_run?: boolean
  user_ids?: string[]
}

type CreditBalanceRow = {
  user_id: string
  current_balance: number
}

const DEFAULT_PAGE_SIZE = 500

function getCurrentCycleKey() {
  return new Date().toISOString().slice(0, 7)
}

function isAuthorized(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.MONTHLY_CREDITS_JOB_SECRET

  if (!expectedToken) {
    return { ok: false, status: 500, error: 'MONTHLY_CREDITS_JOB_SECRET is not configured' }
  }

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  return { ok: true as const }
}

async function fetchTargetBalances(
  userIds?: string[]
): Promise<CreditBalanceRow[]> {
  const supabase = createAdminClient()

  if (userIds && userIds.length > 0) {
    const { data, error } = await supabase
      .from('credit_balances')
      .select('user_id,current_balance')
      .in('user_id', userIds)

    if (error) {
      throw error
    }

    return (data || []) as CreditBalanceRow[]
  }

  const balances: CreditBalanceRow[] = []
  let page = 0

  while (true) {
    const from = page * DEFAULT_PAGE_SIZE
    const to = from + DEFAULT_PAGE_SIZE - 1

    const { data, error } = await supabase
      .from('credit_balances')
      .select('user_id,current_balance')
      .order('user_id', { ascending: true })
      .range(from, to)

    if (error) {
      throw error
    }

    const rows = (data || []) as CreditBalanceRow[]
    balances.push(...rows)

    if (rows.length < DEFAULT_PAGE_SIZE) {
      break
    }

    page += 1
  }

  return balances
}

export async function POST(request: NextRequest) {
  const auth = isAuthorized(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as MonthlyCycleRequest
    const cycleKey = body.cycle_key || getCurrentCycleKey()
    const monthlyAmount = body.monthly_amount
    const dryRun = body.dry_run === true
    const userIds = Array.isArray(body.user_ids)
      ? body.user_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : undefined

    if (!monthlyAmount || !Number.isInteger(monthlyAmount) || monthlyAmount <= 0) {
      return NextResponse.json(
        { error: 'monthly_amount must be a positive integer' },
        { status: 400 }
      )
    }

    const balances = await fetchTargetBalances(userIds)

    if (dryRun) {
      const preview = balances.slice(0, 25).map((balance) => ({
        user_id: balance.user_id,
        current_balance: balance.current_balance,
        reset_amount: Math.min(balance.current_balance, monthlyAmount),
        allocation_amount: monthlyAmount,
        projected_balance_after_cycle:
          balance.current_balance - Math.min(balance.current_balance, monthlyAmount) + monthlyAmount,
      }))

      const totals = balances.reduce(
        (acc, balance) => {
          const resetAmount = Math.min(balance.current_balance, monthlyAmount)
          acc.users += 1
          acc.total_reset_amount += resetAmount
          acc.total_allocation_amount += monthlyAmount
          return acc
        },
        { users: 0, total_reset_amount: 0, total_allocation_amount: 0 }
      )

      return NextResponse.json({
        success: true,
        dry_run: true,
        cycle_key: cycleKey,
        monthly_amount: monthlyAmount,
        totals,
        preview,
      })
    }

    const supabase = createAdminClient()
    const creditService = createCreditService(supabase)

    let usersProcessed = 0
    let resetTransactions = 0
    let allocationTransactions = 0
    let totalResetAmount = 0
    let totalAllocationAmount = 0
    const failures: Array<{ user_id: string; stage: 'reset' | 'allocation'; error: string }> = []

    for (const balance of balances) {
      const resetTransaction = await creditService.applyCappedMonthlyReset(
        balance.user_id,
        monthlyAmount,
        cycleKey
      )

      if (resetTransaction === null && balance.current_balance > 0) {
        failures.push({
          user_id: balance.user_id,
          stage: 'reset',
          error: 'Monthly reset failed or returned null',
        })
        continue
      }

      if (resetTransaction) {
        resetTransactions += 1
        totalResetAmount += Math.abs(resetTransaction.amount)
      }

      const allocationTransaction = await creditService.grantMonthlyAllocation(
        balance.user_id,
        monthlyAmount,
        cycleKey
      )

      if (!allocationTransaction) {
        failures.push({
          user_id: balance.user_id,
          stage: 'allocation',
          error: 'Monthly allocation failed',
        })
        continue
      }

      allocationTransactions += 1
      totalAllocationAmount += allocationTransaction.amount
      usersProcessed += 1
    }

    return NextResponse.json({
      success: failures.length === 0,
      cycle_key: cycleKey,
      monthly_amount: monthlyAmount,
      users_targeted: balances.length,
      users_processed: usersProcessed,
      reset_transactions: resetTransactions,
      allocation_transactions: allocationTransactions,
      total_reset_amount: totalResetAmount,
      total_allocation_amount: totalAllocationAmount,
      failures,
    })
  } catch (error) {
    console.error('Monthly credit cycle failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Monthly credit cycle failed' },
      { status: 500 }
    )
  }
}
