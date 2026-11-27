# Alcovia Financial Dashboard

One place to see Alcovia's revenue, costs, cash and unit economics, built on Zoho Books.

- **Year to Month**: KPI cards for a month or the year-to-date, actual vs AOP charts, cost breakdown.
- **Month to Day**: day-by-day revenue, expenses, cash in bank, cumulative revenue vs pro-rated AOP, ad spend.
- **Data quality**: checks, GST totals, bank reconciliation, everything that fell into Misc.
- **Account mapping**: where every Zoho account lands.

Click any KPI card, cost head or day to see the underlying Zoho transactions. Every table exports to CSV (opens in Excel).

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in the Zoho values, see docs/ZOHO_SETUP.md
npm run dev                  # http://localhost:3000
```

```bash
npm test        # formula and mapping tests
npm run sync    # pull Zoho once and print a summary
npm run build && npm start   # production
```

Deploy on any Node host (Vercel, Render). Set the variables from `.env.example` in the host's
environment settings. `DASHBOARD_PASSWORD` is required in production; without it the app refuses to serve.

## How it works

```
Browser ──> /api/data (Next.js server) ──> Zoho Books API
                │                          AOP sheet CSV (optional)
                └─ cache: memory + file    Meta Ads API (optional)
```

- Credentials live only in environment variables and are used only on the server.
- Zoho data is cached. **Refresh** re-pulls it; the header shows **Last synced**. The cache also refreshes when older than `CACHE_TTL_HOURS`.
- Money is shown in INR with lakh/crore units (₹12.35 L, ₹1.24 Cr); tables show full rupee amounts.

## Decisions this build is based on

| Topic | Decision |
|---|---|
| Source of truth | Zoho Books. Amounts are shown as booked there. |
| Basis | Cash. The books hold payments and expenses, no posted invoices or bills. |
| Financial year | April to March. |
| GST | Zoho holds no GST split, so figures include any GST. GST accounts are shown in Data quality and are currently zero. When GST is recorded in Zoho, the GST panel fills in; the revenue and cost figures will still need a decision on netting. |
| Programme revenue | Customer payments (held in `Unearned Revenue`), counted in the month received. |
| Founder card | Account `SAHIL PURI`. Its expenses count in every cost metric and in capital, never in the bank balance. |
| New customer | A customer's first payment in Zoho, unless `newCustomers` is given in `config/manual-inputs.json`. |
| YTD comparison | In Year-to-date mode the change shown is against the same months of the previous financial year. |

## Formulas

| # | KPI | Formula |
|---|---|---|
| 1 | Capital invested | Founder transfers into the bank (`Owner's Equity`) + company expenses paid on the founder card. Period and cumulative. |
| 2 | Total revenue | Programme + workshop + other income |
| 3 | Total expenses | Fixed costs + variable costs + taxes paid |
| 4 | Net burn | Total expenses (including founder-card spend) − total revenue. The card also shows burn from the company bank only. |
| 5 | Avg net burn (3 months) | (Expenses over the selected month and the two before − revenue over the same months) ÷ 3 |
| 6 | Cash in bank | Bank balance after the last transaction of the month (running sum of bank transactions) |
| 7 | Programme MRR | Programme revenue for the month. Per Alcovian = programme revenue ÷ unique Alcovians. |
| 8 | Cash runway | Cash in bank ÷ avg net burn (3 months). "Not burning" when that average is zero or negative. |
| 9 | Service delivery cost | Sum of cost heads tagged `cogs`; also as % of revenue |
| 10 | Trial → 1-year retention | Trials converted ÷ trials eligible |
| 11 | Annual renewal | Renewals done ÷ renewals eligible |
| 12 | Revenue mix | Each stream ÷ total revenue (donut) |
| 13 | Workshop → programme conversion | Attendees converted ÷ total attendees |
| 14 | Gross profit margin | (Revenue − service delivery cost) ÷ revenue |
| 15 | Net profit margin | (Revenue − total expenses) ÷ revenue |
| 16 | CAC | Cost heads tagged `cac` (Meta Ads + Influencer/Sponsorships/Advertisement) ÷ new customers |
| 17 | True CAC | CAC spend + cost heads tagged `true_cac` (in-house GTM & Marketing incl. interns stipend, outsourced marketing and ad agencies) ÷ new customers |
| 18 | ROAS | Ad-attributed revenue ÷ ad spend |
| 19 | Marketing spend | Total Meta Ads spend: manual input, else Meta Ads API, else the Zoho `META` account |

AOP variance = actual − target, and as a % of target. Benchmarks start in November 2026 (`benchmarkFrom` in `config/aop.json`).
In the Month to Day view the pro-rated target for day *n* is monthly target × *n* ÷ days in the month.

### Not connected yet

KPIs 10, 11, 13 and 18, and "per Alcovian" in 7, need data from the Service Dashboard / Nurture Database and ClickUp.
Until those are connected they show **Not connected**. To fill them by hand, add a month to `config/manual-inputs.json`:

```json
"months": {
  "2026-11": { "uniqueAlcovians": 22, "trialsEligible": 10, "trialsConverted": 4, "adAttributedRevenue": 300000 }
}
```

The Meta Ads API connection is written but has not been run against a live ad account.

## Mapping

All mapping lives in `config/mapping.json`. Nothing is hardcoded.

An account is matched by its own name, then by each parent going up the Zoho account tree; the nearest match wins.
So a new person, vendor or sub-header added under a listed account rolls into that group automatically.
An expense account that matches nothing goes to **Other Miscellaneous Expenses** and is listed under Data quality → Unmapped → Misc.

### Revenue

| Stream | Zoho accounts |
|---|---|
| Programme revenue | `Unearned Revenue`, `Sales` |
| Workshop revenue | `General Income` |
| Other income | Any other income account |

### Fixed costs

| Cost head | Zoho account (and everything under it) | Tags |
|---|---|---|
| Google Workspace | `GOOGLE WORKSPACE` | |
| AI & Tech Subscriptions | `AI Automation` | |
| Website | `Website` | |
| Law Firms | `Legal Service` | |
| ClickUp Costs | `CLICK UP 1` | |
| Workshop Costs | `Workshop Cost` | cogs |
| Office Space Rental (WeWork) | `We Work` | |
| Virtual Office (My HQ) | `MY HQ` | |
| Freelancer CA | `Freelancer CA` | |
| In-House: Founder | `Founder` | |
| In-House: Product | `Salaries - Product` | |
| In-House: GTM & Marketing | `Salaries - GTM` | true_cac |
| In-House: Service | `Devina Neema`, `Neera Handa` | cogs |
| In-House: Strategy | `Salaries - Strategy` | |

### Variable costs

| Cost head | Zoho account (and everything under it) | Tags |
|---|---|---|
| Outsourced: Service Team | `Salaries - Service` (everyone except the two in-house names) | cogs |
| Outsourced: Marketing & Ads Team | `Salaries - Marketing` | true_cac |
| Meta Ads Costs | `META` | cac, ad_spend |
| Athena Labs (Mindset Coaching) | `Athena Labs (Mindset Coaching Org)` | cogs |
| Influencer, Sponsorships, Advertisement | `Influencer , Sponserships, Advertisement` | cac |
| Freelancer Nutritionist | `Freelancer Nutritionist` | cogs |
| Freelancer Fitness Trainer | `Freelancer Fitness Trainer` | cogs |
| Event Venue Payments (Quorum) | `Quorum` | |
| Tutor's Payment | `Tutor's Payment` | cogs |
| Printing Expense | `Printing Expense` | |
| Shooting & Editors | `Shooting & Editors` | |
| Podcast Studio Charges | `Podcasts & Studio Charges` | |
| Food Expenses | `Food Expenses` | |
| Personality Test for Students (Mindler) | `Personality test` | cogs |
| Workshop Speakers Payments | `workshop Speaker` | cogs |
| Podcast Shoot Costs, Merchandise Purchases, Alcovian Projects Expenses (cogs), Contingency Reserve | No Zoho account yet; shows ₹0. Add the account name to the group when it exists. | |
| Other Miscellaneous Expenses | Catch-all for anything unmapped | |

Taxes paid: `Tax Paid Expense`. GST: `GST Payable` (output) and `Input Tax Credits` (input).

### Changing a mapping

Edit `config/mapping.json`, then redeploy (or restart `npm run dev`).

- Move an account: add its exact Zoho name to the `accounts` list of the group you want.
- New cost head: add a group with `id`, `label`, `type` (`fixed` or `variable`) and `accounts`.
- Tags decide the unit-economics groupings: `cogs`, `cac`, `true_cac`, `ad_spend`.
- A second bank or founder card: add it to `bankAccounts` or `founderCardAccounts`.

## AOP targets

`config/aop.json` holds a snapshot of the AOP sheet (total revenue, total cash outflows, fixed, variable, Meta Ads, Alcovians per month).
To read the sheet live instead, publish it (File → Share → Publish to web → CSV) and set `AOP_SHEET_CSV_URL`.
The parser finds rows by the labels in `rows`, so update those if a row is renamed in the sheet.

## Project layout

```
config/            mapping.json, aop.json, manual-inputs.json  (edit these)
src/lib/zoho.ts    Zoho client: token refresh, paging, retries
src/lib/sync.ts    pull + cache
src/lib/classify.ts  transaction → stream / cost head
src/lib/metrics.ts   every formula (shared by server, browser and tests)
src/app/api/       /api/data (GET cached, POST refresh), /api/login
src/components/    views, charts, drill-down
docs/ZOHO_SETUP.md
```
