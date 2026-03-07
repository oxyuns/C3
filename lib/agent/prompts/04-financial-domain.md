=== Financial domain knowledge ===

Apply the following domain expertise when designing DAML contracts for financial use cases.

--- Capital markets ---

BONDS:
- Types: zero-coupon, fixed-rate, floating-rate, callable, puttable, convertible, perpetual.
- Parties: issuer, holder (investor), paying agent, trustee, registrar.
- Lifecycle: issuance → coupon payments → maturity/redemption (or call/put/conversion).
- Key fields: faceValue, couponRate, couponFrequency, maturityDate, dayCountConvention, currency.
- DAML mapping: Bond template with issuer/holder signatories; PayCoupon (nonconsuming scheduled), Redeem (consuming at maturity), Call/Put choices. Use contract key (issuer, ISIN).

EQUITIES:
- Parties: issuer (company), shareholder, transfer agent, exchange.
- Lifecycle: issuance → trading/transfer → corporate actions (dividend, split, rights issue).
- DAML mapping: Share template; Transfer, PayDividend, Split choices. Key by (issuer, shareholderId).

REPO (Repurchase agreements):
- Parties: seller (borrower), buyer (lender/cash provider).
- Lifecycle: opening leg (sell securities for cash) → repo period → closing leg (repurchase at agreed price).
- Key fields: collateral, purchasePrice, repurchasePrice, repoRate, term, marginRatio.
- DAML mapping: RepoContract template; Open, Close, MarginCall, Substitution choices. Track both legs.

SECURITIES LENDING:
- Parties: lender (beneficial owner), borrower, agent (custodian).
- Lifecycle: loan initiation → collateral posting → recall/return → settlement.
- DAML mapping: SecLendContract template; Lend, Return, RecallNotice, CollateralSubstitution choices.

--- Banking & lending ---

TERM LOAN:
- Parties: borrower, lender(s), agent (for syndicated).
- Lifecycle: commitment → drawdown → interest accrual → repayment (scheduled/prepayment) → maturity.
- Key fields: principal, interestRate, rateType (fixed/floating), tenor, amortizationSchedule, covenants.
- DAML mapping: LoanContract template with Drawdown, AccrueInterest, Repay, Prepay, Default choices.

SYNDICATED LOAN:
- Extends term loan with multiple lenders sharing commitments pro-rata.
- Additional parties: lead arranger, agent bank, participant lenders.
- Additional concepts: commitment allocation, transfer of participation, voting on amendments.
- DAML mapping: SyndicatedLoan with FacilityAgreement template; Participation template per lender; Assignment choice for secondary trading.

LETTER OF CREDIT:
- Parties: applicant (buyer), beneficiary (seller), issuing bank, advising bank, confirming bank.
- Lifecycle: application → issuance → presentation of documents → payment/acceptance → settlement.
- DAML mapping: LC template with Present, Examine, Pay, Amend, Cancel choices.

COLLATERALIZED LENDING:
- Parties: borrower (debtor), lender (creditor), custodian (collateral agent).
- Key concepts: LTV ratio, margin call, top-up, liquidation waterfall.
- Lifecycle: origination → monitoring → margin call → top-up or liquidation → settlement.
- DAML mapping: CollateralizedLoan template with MarginCall, TopUp, Liquidate, Settle choices. Model LTV threshold, deadline enforcement, waterfall distribution.

DEPOSITS:
- Parties: depositor, bank.
- Types: demand deposit, term deposit, certificate of deposit.
- DAML mapping: Deposit template with Withdraw, AccrueInterest, Rollover, EarlyTermination choices.

--- Derivatives ---

INTEREST RATE SWAP (IRS):
- Parties: payer (fixed leg), receiver (floating leg), calculation agent.
- Lifecycle: trade → periodic fixings → net settlement on payment dates → maturity.
- Key fields: notional, fixedRate, floatingIndex, spread, paymentFrequency, dayCountConvention, effectiveDate, terminationDate.
- DAML mapping: IRSwap template; Fix (set floating rate for period), NetSettle, EarlyTerminate, Novate choices.

FX FORWARD:
- Parties: buyer, seller (of currency).
- Lifecycle: trade → settlement at value date.
- Key fields: buyCurrency, buyAmount, sellCurrency, sellAmount, valueDate, fixingSource.
- DAML mapping: FXForward template; Settle, Extend (roll), Cancel choices.

OPTIONS:
- Types: European (exercise at expiry only), American (exercise any time), Bermudan (exercise on specific dates).
- Parties: holder (long), writer (short).
- Key fields: underlying, strike, expiry, optionType (call/put), premium, exerciseStyle.
- DAML mapping: Option template; Exercise (consuming), Expire (consuming, if OTM), AssignExercise choices.

CREDIT DEFAULT SWAP (CDS):
- Parties: protection buyer, protection seller, calculation agent.
- Lifecycle: trade → premium payments → credit event determination → settlement (physical or cash).
- DAML mapping: CDS template; PayPremium, DetermineCreditEvent, Settle, Auction choices.

TOTAL RETURN SWAP (TRS):
- Parties: total return payer, total return receiver.
- Key fields: referenceAsset, notional, financingRate, resetFrequency.
- DAML mapping: TRS template; Reset, Settle, Terminate choices.

FUTURES:
- Parties: buyer (long), seller (short), clearinghouse (CCP).
- Key concepts: initial margin, variation margin, daily settlement, delivery.
- DAML mapping: FuturesPosition template; MarkToMarket, MarginCall, Deliver, CashSettle choices.

--- Digital assets ---

TOKEN ISSUANCE:
- Parties: issuer, tokenHolder, registry (optional).
- Types: security token, utility token, stablecoin.
- DAML mapping: Token template with Mint, Transfer, Burn, Freeze choices. Use interface ITransferable for common transfer logic.

ATOMIC SWAP:
- Parties: partyA, partyB.
- Pattern: both legs settle atomically in one transaction or neither does.
- DAML mapping: SwapProposal template; Accept choice creates both transfers in a single do block. Use Propose/Accept pattern.

DELIVERY VS PAYMENT (DvP):
- Parties: seller (asset deliverer), buyer (cash payer), settlement agent.
- Pattern: simultaneous exchange of asset and payment.
- DAML mapping: DvPInstruction template; Settle choice atomically archives asset contract and payment contract, creating new ones for the counterparties.

CUSTODY:
- Parties: beneficial owner, custodian, sub-custodian.
- DAML mapping: CustodyAccount template with Deposit, Withdraw, Transfer, CorporateAction choices.

STABLECOIN:
- Parties: issuer, holder, reserve manager.
- DAML mapping: Stablecoin template (extends Token); Mint (against reserve), Redeem (burn for fiat), Transfer choices.

--- Insurance ---

INSURANCE POLICY:
- Parties: insurer, policyholder, beneficiary, underwriter.
- Lifecycle: application → underwriting → issuance → premium collection → claim → payout → renewal/expiry.
- DAML mapping: Policy template; PayPremium, FileClaim, AdjudicateClaim, Payout, Renew, Cancel choices.

CLAIMS PROCESSING:
- Parties: claimant, insurer, adjuster, third-party (if liability).
- DAML mapping: Claim template; Submit, Investigate, Approve, Deny, Appeal, Settle choices.

REINSURANCE:
- Parties: cedent (primary insurer), reinsurer.
- Types: treaty (automatic), facultative (case-by-case), proportional, excess-of-loss.
- DAML mapping: ReinsuranceContract template; Cede, Accept, Settle, Commute choices.

PARAMETRIC INSURANCE:
- Parties: insurer, policyholder, oracle (data provider).
- Trigger: automatic payout when measured parameter exceeds threshold (e.g. earthquake magnitude, rainfall).
- DAML mapping: ParametricPolicy template; ReportEvent (by oracle, nonconsuming), AutoPayout (triggered when condition met), Expire choices.

--- Trade finance ---

DOCUMENTARY COLLECTION:
- Parties: exporter (drawer), importer (drawee), remitting bank, collecting bank.
- DAML mapping: Collection template; PresentDocuments, Accept, Pay, Protest choices.

SUPPLY CHAIN FINANCE (SCF):
- Parties: buyer, supplier, financier (bank/factor).
- Lifecycle: invoice approval → early payment offer → discount → settlement at maturity.
- DAML mapping: ApprovedPayable template; RequestEarlyPayment, Finance, Settle choices.

WAREHOUSE RECEIPT:
- Parties: depositor, warehouse operator, financier (pledge holder).
- DAML mapping: WarehouseReceipt template; Deposit, Release, Pledge, Verify choices.

BILL OF EXCHANGE / PROMISSORY NOTE:
- Parties: drawer, drawee (acceptor), payee, endorser.
- DAML mapping: BillOfExchange template; Accept, Endorse, Present, Pay, Dishonor choices.

--- Structured finance & project finance ---

PROJECT FINANCE (PF):
- Definition: non-recourse or limited-recourse financing secured by the project's own cash flows and assets, not the sponsor's balance sheet.
- Parties: sponsor(s), SPV (Special Purpose Vehicle / borrower), lender syndicate (senior, mezzanine), EPC contractor, O&M operator, offtaker, government/authority, insurance provider, independent engineer.
- SPV: a ring-fenced legal entity created solely for the project. All project assets, contracts, and cash flows reside within the SPV. Prevents cross-default with sponsor.
- Lifecycle: development → financial close → construction (drawdown) → commercial operation → debt service → refinancing or maturity.
- Key fields: totalProjectCost, equityContribution, seniorDebt, mezzanineDebt, constructionPeriod, operationPeriod, targetIRR, upfrontFee, commitmentFee.
- Key ratios: DSCR (Debt Service Coverage Ratio), LLCR (Loan Life Coverage Ratio), PLCR (Project Life Coverage Ratio), LTV (Loan-to-Value).
- DAML mapping: SPV template (signatory: sponsor, agent bank); FacilityAgreement template per tranche; Drawdown, Repay, InterestPayment, RefinanceChoices. Use subgraphs in diagrams to show SPV boundary.

SPC (Special Purpose Company) / ABCP:
- SPC: entity that purchases receivables or assets from the originator and issues asset-backed securities.
- ABCP (Asset-Backed Commercial Paper): short-term securities (typically 30-270 days) backed by a pool of receivables or assets, issued via SPC/conduit.
- Parties: originator (seller of assets), SPC/conduit (issuer), investors (CP holders), liquidity provider, credit enhancer, trustee, rating agency.
- Lifecycle: asset origination → true sale to SPC → CP issuance → collection → rollover or redemption.
- DAML mapping: SPC template; AssetPurchase, IssuCP, Redeem, Rollover choices. ReceivablePool template tracks underlying assets.

TRANCHING (Senior / Mezzanine / Equity):
- Senior tranche: lowest risk, first claim on cash flows, lowest interest rate. Typically 50-70% of total debt.
- Mezzanine tranche: subordinated to senior, higher interest rate, absorbs losses after equity. Typically 10-20%.
- Equity tranche: first loss position, highest return, provided by sponsor(s). Typically 20-40%.
- Waterfall priority: operating expenses → senior interest → senior principal → mezzanine interest → mezzanine principal → equity distribution.
- DAML mapping: Tranche template with trancheType (Senior/Mezzanine/Equity), principal, rate, priority; WaterfallDistribution choice that allocates available cash by priority order.

WATERFALL (Cash flow distribution):
- Pre-enforcement waterfall (normal operations):
  1. Operating expenses and taxes
  2. Senior debt service (interest + principal)
  3. Cash reserve replenishment (DSRA — Debt Service Reserve Account)
  4. Mezzanine debt service
  5. Equity distributions (subject to lock-up tests)
- Post-enforcement waterfall (after event of default):
  1. Enforcement costs
  2. Senior principal + accrued interest
  3. Mezzanine principal + accrued interest
  4. Remaining to equity
- Lock-up test: equity distributions blocked if DSCR falls below threshold (e.g. 1.2x).
- DAML mapping: CashWaterfall template; Distribute choice that iterates through priority buckets; each bucket represented as a WaterfallBucket record.

PF COVENANTS & TRIGGERS:
- LTV covenant: if loan-to-value exceeds threshold (e.g. 60%), trigger collateral call or cash sweep.
- DSCR covenant: if quarterly DSCR falls below threshold (e.g. 1.2x), trigger early redemption, lock-up, or step-in rights.
- Cash sweep: mandatory prepayment from excess cash flows when covenant is breached.
- Step-in rights: lender's right to assume operational control of the project upon severe default.
- DAML mapping: Covenant template with covenantType, threshold, testFrequency; TestCovenant (nonconsuming, calculates ratio), TriggerBreach (consuming, escalates to remedy or enforcement).

PF-SPECIFIC GUARANTEES:
- EPC guarantee: Tier-1 contractor guarantees construction completion (fixed price, fixed date).
- Performance guarantee: O&M operator guarantees minimum output/availability.
- Sponsor support: completion guarantee, cost overrun facility, equity cure.
- DAML mapping: Guarantee template with guarantor, beneficiary, guaranteeType, maxExposure; CallGuarantee, ReleaseGuarantee choices.

SECURITIZATION (ABS / MBS / CLO):
- ABS (Asset-Backed Securities): securities backed by pools of auto loans, credit cards, student loans, etc.
- MBS (Mortgage-Backed Securities): backed by mortgage pools. RMBS (residential) vs CMBS (commercial).
- CLO (Collateralized Loan Obligation): backed by leveraged loan pools.
- Common structure: originator → SPV (true sale) → tranching (AAA to equity) → investors.
- DAML mapping: SecuritizationVehicle template; SellAssets, IssueTranches, DistributeCashFlow, Waterfall choices. AssetPool template tracks underlying; Tranche template per class.

REFINANCING:
- Replacing existing debt with new debt, typically at better terms or at maturity (bullet repayment).
- Parties: existing lender(s), new lender(s), borrower/SPV.
- DAML mapping: RefinanceProposal template; existing facility's Repay choice + new facility's Drawdown in same transaction. Atomic execution ensures no gap.

--- Common financial concepts (apply across all domains) ---

SETTLEMENT METHODS:
- DvP (Delivery vs Payment): simultaneous exchange of asset and cash.
- PvP (Payment vs Payment): simultaneous exchange of two currencies.
- FoP (Free of Payment): asset transfer without corresponding payment.
- Model in DAML: settlement choice that atomically creates/archives both legs.

NETTING:
- Bilateral netting: offset obligations between two parties to reduce settlement amounts.
- Multilateral netting: offset across multiple parties via a central counterparty.
- Model in DAML: NettingSet template that collects obligations, NetSettle choice that computes net amounts and creates single settlement contracts.

COLLATERAL MANAGEMENT:
- Eligible collateral, haircuts, valuation, substitution, margin calls.
- Model in DAML: CollateralAgreement template; PostCollateral, SubstituteCollateral, Revalue, MarginCall choices. Track haircut-adjusted values.

DAY COUNT CONVENTIONS:
- ACT/360, ACT/365, ACT/ACT, 30/360, 30E/360.
- Use in interest calculations: accruedInterest = principal * rate * dayCountFraction.
- Implement as a helper function in a Util module.

BUSINESS DAY CONVENTIONS:
- Following, Modified Following, Preceding, Modified Preceding.
- Use for adjusting payment/settlement dates that fall on holidays.
- Model holiday calendar as a list of Date values.

CURRENCIES:
- Represent as Text (ISO 4217: "USD", "EUR", "JPY", etc.).
- Use Numeric 2 or Numeric 10 depending on precision needs.
- Multi-currency contracts: store amount and currency as a pair.