# Smart Debt Planner – AI Financial Assistant

A personal, single-user web app for managing salary, expenses, loans, credit cards, savings and repayment plans, with the goal of becoming debt-free as early as possible.

- **Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui-style components + Recharts**
- **Neon PostgreSQL + Drizzle ORM** (migrations in `drizzle/`)
- **Deterministic, decimal-safe financial engine** (`src/lib/finance/`, `decimal.js`) with unit tests
- **Optional AI assistant** via Vercel AI SDK + AI Gateway. The app works fully without AI.

## Features

| Area | What you can do |
|---|---|
| Dashboard | 8 summary cards, insights (highest-cost debt, next payment, upcoming closure, recommended extra payment, target progress) and 6 charts, all from database data |
| Financial Profile / Income | Salary, salary credit day, savings, emergency target; unlimited additional / variable / freelance / other income sources |
| Expenses | Unlimited categories (essential / discretionary), default + month-specific budgets, actual expenses (one-time / recurring), copy recurring to next month, budget vs actual with overspending alerts, yearly view, CSV import |
| Loans | Unlimited loans with reducing / flat interest, annual or monthly rates, monthly or daily (actual/365) convention, EMI or interest-only, prepayment rules & charges, extra monthly charges. Record EMI / interest / extra principal / charges / top-ups / statement balance; reverse the latest entry. Per-loan schedule and extra-payment impact calculator |
| Credit Cards | Balance, limit, rate, minimum due, billing/due day, fees. Unknown values are shown as **Not configured** (never guessed). Payments, purchases, interest, fees, settlement simulation |
| Repayment Planner | Live simulator (runs in the browser): change income, expenses, savings, extra repayment, start month, strategy, priority order, debt balances/rates/EMIs, bonuses, lump sums, settlements, salary/expense/rate changes. Strategy comparison (My Priority / Avalanche / Snowball), 4 preset scenarios (Current, Recommended, Aggressive, Conservative) + saved scenarios, month-by-month table, loan-wise balances, monthly allocation, saved repayment plans |
| Debt-Free Goal | Target month → required monthly repayment, current capacity, shortfall, additional income, possible expense cuts, achievability explanation, alternative dates |
| Monthly Review | Enter salary received, actual expenses, savings and statement balances; reconcile; close the month (immutable snapshot) and auto-generate the next schedule; history and planned-vs-actual |
| Reports | 9 reports (+ saved plans) as CSV, Excel (.xlsx) or PDF |
| AI Assistant | “Personal Debt Optimizer”: built-in rule-based engine always available; optional LLM (with explicit consent) that must call engine tools for every number |
| Settings | Change password, AI status, full JSON export, reset / delete data, delete account, audit history |

## Financial calculation rules

All money maths uses `decimal.js` (40 significant digits, half-up rounding to paise each month). JavaScript numbers are only used for display.

- **Every period:** `opening + interest + charges − payments = closing` (unit-tested for every debt and month).
- Interest accrues on the opening balance; payments apply at month end, interest first, then principal.
- **Reducing balance:** `balance × annual/12` (or `× monthly rate`). **Daily:** `balance × annual/365 × days in month`. **Flat:** `original principal × annual/12` until closure (flagged as an estimate — confirm your lender's rebate rules).
- **EMI:** `P·r·(1+r)^n / ((1+r)^n − 1)`; flat EMI: `(P + P·rate·years)/n`.
- **Minimums:** EMI (+charges) for EMI loans; interest (+charges) for loans with no EMI (e.g. the friend loan: 3%/month on the remaining principal, recalculated after each prepayment); configured minimum due for cards, otherwise an estimate of 5% (min ₹200), flagged.
- **Unknown rates** are excluded from interest (never invented); results are marked as estimates and the UI asks for the real rate. In Avalanche ordering an unknown rate is ranked first as a precaution, and this is stated.
- Contractual minimums on every active debt are always paid before any extra allocation. If cash is short, savings are drawn and any remaining shortfall is reported.
- Prepayment / foreclosure charges are applied to extra principal. Debts that disallow prepayment receive only their minimums.
- **Cash flow:** `Available for debt = Total income − Total expenses − Planned savings (+ additional repayment)`. EMIs are paid *from* this amount (shown separately), so they are never subtracted twice. `Remaining for extra = Available − Mandatory EMIs/minimums`.
- **Avalanche** ranks by effective annual cost (flat-rate loans use their reducing-balance-equivalent IRR); **Snowball** by smallest balance; **My Priority** by your order.
- Planned savings stop automatically once the emergency target is reached (configurable); afterwards that cash flows to debt.

Run the tests:

```bash
npm test
```

## Initial data

On first setup the app seeds: salary ₹86,000; living expenses ₹10,000 (recorded under *Other expenses* until you split it); savings ₹0; emergency target ₹10,000; Credit Card ₹55,000 (rate / minimum / due date **not configured**); Loan A ₹13,27,739 @ 11.5% p.a., EMI ₹30,300, 56 months; Loan B ₹2,36,843 @ 25% p.a., EMI ₹21,349, 13 months; Friend Loan ₹4,00,000 @ 3%/month reducing, no EMI; priority Credit Card → Loan B → Friend Loan → Loan A.

Defaults chosen by the app (editable): planned savings ₹2,000/month until the ₹10,000 target is reached, then redirected to debt; plan starts in the current month.

> Note: with an EMI of ₹30,300 the calculated closure of Loan A is 58 months vs the stated 56 — the Loans page flags this so you can check the rate/EMI against your statement.

## Local setup

Requirements: Node.js 22+, a PostgreSQL database (a free Neon project or local Postgres).

```bash
npm install
```

```bash
cp .env.example .env
```

Edit `.env`: set `DATABASE_URL` and `AUTH_SECRET` (`openssl rand -base64 32`). `SETUP_CODE` is optional locally.

```bash
npm run db:migrate
```

```bash
npm run dev
```

Open http://localhost:3000 → you are redirected to **/setup** to create your username/password. The initial financial data is loaded automatically. (`npm run db:seed` also seeds it without creating a user.)

### Database & migrations

- Schema: `src/lib/db/schema.ts` (16 required tables + `users` and `audit_log`; money columns are `numeric(14,2)`, rates `numeric(9,4)`, indexed, with timestamps and foreign keys).
- Generate a migration after changing the schema: `npm run db:generate`
- Apply migrations: `npm run db:migrate` (also runs automatically during the Vercel build via `vercel-build`).
- Neon URLs use the Neon serverless driver; any other Postgres URL uses `node-postgres`.

## Deploying to Vercel

1. Push this repository to GitHub and **Import** it in Vercel (framework: Next.js — no custom settings needed).
2. Create a Neon database (Vercel Marketplace → Neon, or neon.tech) and copy the pooled connection string.
3. In Vercel → Project → Settings → Environment Variables add:
   - `DATABASE_URL` – Neon connection string (**required**; `POSTGRES_URL` from the Neon/Vercel integration is also accepted). Paste the value without quotes.
   - `AUTH_SECRET` – long random string (recommended; if missing, a key is derived from the database URL)
   - `SETUP_CODE` – optional one-time code required on the setup page (recommended so nobody else can create the account before you)
   - Optional: `AI_GATEWAY_API_KEY` (not needed if Vercel AI Gateway OIDC is available for the project) and `AI_MODEL` (default `anthropic/claude-sonnet-5.5`)
4. Deploy (after adding or changing variables, **Redeploy** so they take effect). The `vercel-build` script runs `db:migrate` then `next build`; if migrations cannot run at build time, the tables are created automatically on the first request.
5. Open the deployment → `/setup` → create your account.

### Troubleshooting

Open **`/api/health`** on your deployment. It returns JSON (no financial data) showing whether the database URL is present, the database is reachable, the tables exist and an account has been created, e.g.

```json
{"ok":true,"database":"connected","schema":"ready","accountCreated":false,"config":{"databaseUrl":"DATABASE_URL", ...}}
```

- `"databaseUrl":"missing"` → add `DATABASE_URL` and redeploy.
- `"database":"error"` → the `error` field shows the connection problem (wrong password/host, project suspended, etc.).
- `"accountCreated":true` but you can't sign in → the account already exists; use the username you chose, or reset via Neon SQL editor: `DELETE FROM users;` then visit `/setup` again.

## Security

- Single user; passwords hashed with scrypt (N=16384); login lockout after 5 failures (15 min).
- Signed, HTTP-only, SameSite=Lax session cookie (JWT HS256, 7 days); all pages, server actions and API routes require a session (`src/proxy.ts` + per-action checks).
- Server-side validation with Zod on every write. Secrets only in environment variables; nothing sensitive is sent to the browser.
- Audit log of every financial change; JSON export and full deletion in Settings.
- CSV exports neutralise spreadsheet formula injection.
- AI: disabled by default. Personal data is sent to the AI provider **only** when AI is enabled **and** you tick the explicit consent box. The AI has read-only tools that call the deterministic engine; it cannot record, confirm or modify payments or balances.

## Project structure

```
src/
  app/(auth)/        login, setup
  app/(app)/         dashboard, profile, income, expenses, loans, credit-cards, planner,
                     assistant, goal, monthly-review, reports, settings
  app/actions/       server actions (validated writes + audit)
  app/api/           export/[report], data/export, assistant, health
  lib/finance/       money, dates, debt maths, simulator, goal/scenario analysis (+ tests)
  lib/assistant/     local rule-based assistant + AI Gateway tools
  lib/db/            schema, client, seed
drizzle/             SQL migrations
scripts/             migrate.ts, seed.ts
```
