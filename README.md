# Outlet Liquors — Wedding Order Questionnaire

A small Node.js app that makes crafting wedding wine & liquor orders
painless:

1. Customer fills out a three-question form.
2. The server pulls the current product catalog from the Outlet Liquors
   website, drafts an order (with case + wedding discounts already applied),
   and emails it to the customer from a Gmail account.
3. The customer replies to the email with plain-English tweaks. A poller
   picks up the reply, revises the order, and re-sends it.
4. When the customer replies "approve" / "confirmed" / "looks good" the
   order is locked in and a pickup date is emailed back.
5. Every order — and every revision — is kept in `data/orders.json`
   alongside its `createdAt` timestamp.

## The questionnaire

Three questions, exactly as requested:

- **Name, Email, and/or Number** — free-text blob, parsed into
  `{ name, email, phone }` (see `src/contactParser.js`).
- **How many people are going to be at the wedding?**
- **What kind of liquor do they want?**

## Project layout

```
server.js                 Express HTTP server + form endpoint
public/                   Questionnaire form (static HTML/CSS/JS)
src/
  scraper.js              Outlet Liquors catalog scraper (+ fallback catalog)
  contactParser.js        Parses "name / email / phone" blob
  orderBuilder.js         Turns preferences + guest count into line items
  discounts.js            Case + wedding discount engine
  emailTemplate.js        Renders order emails
  gmailAuth.js            One-time OAuth setup (`npm run auth`)
  emailService.js         Gmail send/fetch with dry-run fallback
  replyParser.js          Parses "add/remove/change/approve" replies
  orderStore.js           JSON-file order + revision store
  pickupScheduler.js      Computes a pickup date
  orderFlow.js            Lifecycle: draft → revise → confirm
  emailPoller.js          Watches Gmail for customer replies
data/                     Runtime state (orders.json, token.json, cache)
```

## Setup

```bash
npm install
cp .env.example .env
# Edit .env — at minimum set OUTLET_LIQUORS_URL and GMAIL_USER
```

### Gmail OAuth (one-time)

1. Create a Google Cloud project, enable the Gmail API.
2. Create an OAuth client of type **Desktop app** and download the JSON.
3. Save it at the repo root as `credentials.json` (or point
   `GMAIL_CREDENTIALS_PATH` somewhere else).
4. Run `npm run auth` and follow the printed URL. Paste the code back in.
   A `data/token.json` is written and reused from then on.

> If you skip this step the app still works — it will just log the email
> body to the console instead of sending it, so you can exercise the full
> flow during development.

### Running

```bash
npm start                  # web server on $PORT (default 3000)
npm run poll               # one-off Gmail poll for replies
node src/emailPoller.js --watch   # long-running poller
```

Point a cron job at `npm run poll` every few minutes (or run the `--watch`
mode under a process manager like `pm2` / systemd) so customer replies get
picked up automatically.

## Connecting to the Outlet Liquors website

`src/scraper.js` fetches `OUTLET_LIQUORS_URL + OUTLET_LIQUORS_CATALOG_PATH`
and tries a handful of common product-card selectors (WooCommerce, Shopify,
generic). If nothing parses — or the site is down — it falls back to a
built-in sample catalog so the rest of the app keeps working.

If the live site uses a layout the generic selectors don't hit, update
`extractFromHtml()` with site-specific selectors. Cached results live in
`data/catalog-cache.json` with a TTL controlled by
`CATALOG_CACHE_TTL_MINUTES`.

## Discounts

Two discounts, both configurable in `.env`:

| Discount              | How it's applied                                              |
| --------------------- | ------------------------------------------------------------- |
| **Wine case discount** | Wine lines (red, white, rosé, champagne, sparkling) with 6+ bottles get `CASE_DISCOUNT_PERCENT` (default 5%) off. Applies to both half-cases (6) and full cases (12+). |
| **Wedding discount**  | Flat `WEDDING_DISCOUNT_PERCENT` off the post-case subtotal when `guestCount ≥ WEDDING_DISCOUNT_MIN_GUESTS`. |

Both appear as their own line in the email so the customer can see exactly
what they saved.

## Automated revision loop

Customer replies are parsed by `src/replyParser.js`. Supported phrases:

- `approve` / `confirmed` / `looks good` / `lgtm` / `perfect`
- `add 2 cases of pinot noir` (looks up the product in the catalog if not
  already on the order)
- `add 6 bottles of chardonnay`
- `remove the tequila` / `drop the rum` / `no beer`
- `change champagne to 3 bottles`
- `more red wine` / `less beer`

Anything we can't parse is included in the reply email as "I couldn't
parse these, could you clarify?" so the human is always in the loop.

## Order tracking

Every order written to `data/orders.json` has:

```json
{
  "id": "ORD-MNW4GAR5",
  "createdAt": "2026-04-12T18:53:20.368Z",
  "updatedAt": "2026-04-12T18:54:05.102Z",
  "status": "draft|sent|revised|confirmed|ready",
  "threadId": "<gmail thread id>",
  "revisions": [
    { "at": "...", "note": "initial draft", "snapshot": { ... } },
    { "at": "...", "note": "applied: added 24× Willamette Pinot Noir; removed Blanco Tequila", "snapshot": { ... } }
  ],
  "pickupDate": "2026-04-20T12:00:00.000Z",
  ...
}
```

List every tracked order via `GET /api/orders` or
`GET /api/orders?since=2026-04-01`.

## HTTP API

| Method | Path                    | Purpose                                    |
| ------ | ----------------------- | ------------------------------------------ |
| GET    | `/`                     | Questionnaire form                         |
| POST   | `/api/orders`           | Submit form → draft order + send email     |
| GET    | `/api/orders`           | List every order (optional `?since=<iso>`) |
| GET    | `/api/orders/:id`       | Single order with full revision history   |
| POST   | `/api/orders/:id/reply` | Simulate a customer reply (for local dev)  |

## Testing the loop without Gmail

```bash
# start the server
npm start

# in another shell, create a draft
curl -s http://localhost:3000/api/orders \
  -H 'content-type: application/json' \
  -d '{"contact":"Jane Doe, jane@example.com, (555) 123-4567","guestCount":150,"liquorPreferences":"red wine, white wine, champagne, tequila"}'

# simulate the customer replying
curl -s http://localhost:3000/api/orders/ORD-XXXX/reply \
  -H 'content-type: application/json' \
  -d '{"text":"add 2 cases of pinot noir. remove the tequila."}'

# approve
curl -s http://localhost:3000/api/orders/ORD-XXXX/reply \
  -H 'content-type: application/json' \
  -d '{"text":"approve"}'
```

Without Gmail credentials, every outbound email is logged to stdout
instead of sent. Once `credentials.json` + `token.json` are in place the
exact same flow hits Gmail for real.
