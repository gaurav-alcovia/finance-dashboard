# Zoho Books API setup

The dashboard reads Zoho Books with a read-only OAuth "Self Client". You do this once.

## 1. Find your data centre and organisation ID

- If you sign in at `books.zoho.in`, you are on the India data centre: use `accounts.zoho.in` and `www.zohoapis.in`.
- Organisation ID: Zoho Books → click the organisation name (top right) → **Manage Organizations**.

## 2. Create a Self Client

1. Open `https://api-console.zoho.in` (use the console for your own data centre).
2. **Add Client** → **Self Client** → **Create**.
3. Open the **Client Secret** tab and copy the **Client ID** and **Client Secret**.

## 3. Generate a one-time code

1. Open the **Generate Code** tab.
2. Scope: `ZohoBooks.fullaccess.READ` (read-only).
3. Time duration: 10 minutes. Description: anything.
4. **Create**, choose the Zoho Books portal and organisation, then copy the code.

The code works once and expires after 10 minutes.

## 4. Exchange the code for a refresh token

```bash
curl -X POST "https://accounts.zoho.in/oauth/v2/token" \
  -d "grant_type=authorization_code" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "code=YOUR_GENERATED_CODE"
```

The response contains `refresh_token`. It does not expire. Store it in a password manager.
If you get `invalid_code`, generate a new code and run the command again.

## 5. Put the values in the environment

Set `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` and `ZOHO_ORGANIZATION_ID`
(see `.env.example`). Check the connection with:

```bash
npm run sync
```

It prints the organisation name, the number of transactions and the last six months of totals.

## Rotating credentials

In the API console open the Self Client → **Client Secret** → regenerate the secret, then repeat
steps 3 to 5. The old refresh token stops working. To revoke a single refresh token without
changing the secret:

```bash
curl -X POST "https://accounts.zoho.in/oauth/v2/token/revoke?token=THE_REFRESH_TOKEN"
```

## What the dashboard calls

All calls are `GET`, made from the server only, never from the browser.

| Endpoint | Used for |
|---|---|
| `/organizations` | Organisation name |
| `/chartofaccounts?showbalance=true` | Account tree (for roll-up by parent) and GST balances |
| `/banktransactions` | Every posting through the bank and card accounts: the full ledger |
| `/bankaccounts` | Balances for reconciliation, uncategorised feed count |
| `/journals`, `/bills`, `/invoices`, `/creditnotes` | Counts only, for data-quality warnings |

Access tokens last one hour and are refreshed automatically. Lists are paged at 200 rows.
Zoho allows about 100 requests a minute per organisation; a sync uses about a dozen, and
`429` or `5xx` responses are retried with back-off.
