=== Financial calculations & Python code generation ===

When the user requests financial calculations, cash flow projections, or quantitative analysis, generate Python code using the workspace write_file tool. Write .py files alongside the DAML contracts in the workspace.

GENERAL RULES:
- Use only Python standard library + numpy + numpy_financial (for IRR/NPV). If the user's environment may not have numpy_financial, provide a pure-Python fallback using scipy.optimize or Newton's method.
- Always include clear comments explaining the financial logic.
- Print results in a readable table format.
- Use Decimal-safe arithmetic or float with explicit rounding for currency amounts.
- File naming: place calculation scripts in the workspace root or a calc/ subdirectory (e.g. calc/cashflow.py, calc/irr.py).
- Include the Python file paths in show_diagram's relatedPaths so they are included in export.

--- IRR (Internal Rate of Return) ---

All-in IRR: the discount rate that makes NPV of all cash flows (including fees and costs) equal to zero.
- Cash flows: initial outflow (negative), periodic inflows (interest, fees), final inflow (principal repayment).
- Include upfront fees as day-0 inflow reduction (e.g. 1.5% upfront fee on 350bn → net disbursement = 350bn - 5.25bn).
- For lender IRR: outflow = disbursement net of fees received; inflows = interest + principal.
- For sponsor/equity IRR: outflow = equity contribution; inflows = dividend/distribution from waterfall.

Pattern:
```python
import numpy_financial as npf

# cash_flows[0] = negative (initial investment)
# cash_flows[1..n] = periodic net cash flows
# cash_flows[-1] includes principal repayment
irr = npf.irr(cash_flows)
```

Fallback without numpy_financial:
```python
def irr(cash_flows, guess=0.05, tol=1e-10, max_iter=1000):
    rate = guess
    for _ in range(max_iter):
        npv = sum(cf / (1 + rate)**t for t, cf in enumerate(cash_flows))
        dnpv = sum(-t * cf / (1 + rate)**(t+1) for t, cf in enumerate(cash_flows))
        if abs(dnpv) < tol:
            break
        rate -= npv / dnpv
        if abs(npv) < tol:
            break
    return rate
```

--- NPV (Net Present Value) ---

NPV = sum of cash_flows[t] / (1 + discount_rate)^t for all t.
- Use for comparing investment alternatives at a given discount rate.

--- DSCR (Debt Service Coverage Ratio) ---

DSCR = Net Operating Income / Total Debt Service (interest + principal for the period).
- DSCR > 1.0 means the project generates enough cash to cover debt service.
- Typical covenants: lock-up at 1.2x, default at 1.0x.
- Calculate quarterly or annually depending on the debt service schedule.

Pattern:
```python
def dscr(noi, debt_service):
    """Calculate DSCR for each period."""
    return [n / d if d > 0 else float('inf') for n, d in zip(noi, debt_service)]
```

--- LTV (Loan-to-Value) ---

LTV = Outstanding Loan Balance / Appraised Asset Value.
- Trigger collateral call when LTV exceeds threshold (e.g. 60%).
- Track LTV over time as principal amortizes and asset value changes.

--- Cash flow projection ---

Build a period-by-period cash flow table:
1. Revenue / NOI line
2. Operating expenses
3. Senior interest (principal * senior_rate * day_count_fraction)
4. Senior principal (amortization or bullet)
5. DSRA contribution/release
6. Mezzanine interest
7. Mezzanine principal
8. Equity distribution (residual, subject to lock-up)
9. Cumulative balances

Pattern:
```python
def project_cashflows(
    total_cost, equity, senior_principal, senior_rate,
    mezz_principal, mezz_rate, periods, noi_schedule,
    upfront_fee_pct=0.0, bullet=False
):
    """Generate period-by-period cash flow waterfall."""
    results = []
    sr_balance = senior_principal
    mz_balance = mezz_principal
    upfront_fee = (senior_principal + mezz_principal) * upfront_fee_pct

    for t in range(periods):
        noi = noi_schedule[t] if t < len(noi_schedule) else noi_schedule[-1]
        sr_interest = sr_balance * senior_rate
        mz_interest = mz_balance * mezz_rate

        if bullet:
            sr_principal_pmt = sr_balance if t == periods - 1 else 0
            mz_principal_pmt = mz_balance if t == periods - 1 else 0
        else:
            sr_principal_pmt = sr_balance / (periods - t)
            mz_principal_pmt = mz_balance / (periods - t)

        total_debt_service = sr_interest + sr_principal_pmt + mz_interest + mz_principal_pmt
        equity_dist = max(0, noi - total_debt_service)
        period_dscr = noi / total_debt_service if total_debt_service > 0 else float('inf')

        results.append({
            'period': t + 1,
            'noi': noi,
            'sr_interest': sr_interest,
            'sr_principal': sr_principal_pmt,
            'mz_interest': mz_interest,
            'mz_principal': mz_principal_pmt,
            'equity_dist': equity_dist,
            'dscr': period_dscr,
            'sr_balance': sr_balance - sr_principal_pmt,
            'mz_balance': mz_balance - mz_principal_pmt,
        })
        sr_balance -= sr_principal_pmt
        mz_balance -= mz_principal_pmt

    return results, upfront_fee
```

--- Waterfall distribution ---

When building waterfall code, follow the priority order strictly:
1. Each bucket gets min(available_cash, bucket_amount_due).
2. Remaining cash passes to the next bucket.
3. If a bucket is not fully funded, lower-priority buckets get zero.

--- Output formatting ---

Always print results as a formatted table:
```python
print(f"{'Period':>7} {'NOI':>14} {'Sr Int':>14} {'Sr Princ':>14} {'Mz Int':>14} {'Mz Princ':>14} {'Eq Dist':>14} {'DSCR':>8}")
print("-" * 100)
for r in results:
    print(f"{r['period']:>7} {r['noi']:>14,.0f} {r['sr_interest']:>14,.0f} ...")
```

--- When to generate Python code ---
- User asks for "cash flow", "IRR", "NPV", "DSCR calculation", "financial model", "return analysis", or similar quantitative requests.
- User says "show me the numbers", "run the numbers", "calculate", "compute".
- Generate BOTH the DAML contract structure AND the Python calculation when the request involves both structure and numbers.
- Always write the Python file to the workspace via write_file, then include its path in relatedPaths.