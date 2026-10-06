# API Reference

Base URL: `http://localhost:4000/api`

All responses are JSON. Every request is served with a simulated latency
(default `350ms`) so that loading and pending states are meaningful — set
`LATENCY_MS=0` to disable it while debugging.

Collection endpoints return an envelope:

```json
{
  "data": [ /* rows */ ],
  "meta": { "page": 1, "pageSize": 25, "total": 7, "totalPages": 1 }
}
```

Detail endpoints return the resource object directly. Errors return
`{ "error": string, "fields"?: { [field]: string } }`.

### Common query parameters (collection endpoints)

| Param      | Description                                              |
|------------|----------------------------------------------------------|
| `page`     | 1-based page number (default `1`)                         |
| `pageSize` | Rows per page, max `100` (default `25`)                   |
| `sort`     | Field name to sort by                                     |
| `order`    | `asc` (default) or `desc`                                 |

---

## Health

### `GET /health`
```json
{ "status": "ok", "time": "2026-09-29T23:00:00.000Z" }
```

---

## Portfolio

### `GET /portfolio/summary`
Aggregated KPIs across all commitments. Recomputed on each request, so it
reflects any commitments you create.

```json
{
  "totalCommitted": 10500000,
  "totalCalled": 5925000,
  "totalDistributed": 1620000,
  "totalNav": 5728000,
  "unfundedCommitment": 4575000,
  "netMoic": 1.24,
  "netDpi": 0.27,
  "activeCommitments": 5,
  "currency": "USD"
}
```

---

## Funds

### `GET /funds`
Filters: `strategy`, `stage` (`open` | `closing_soon` | `closed`), `region`,
`q` (matches fund name or manager). Supports sort + pagination.

```jsonc
// GET /funds?stage=open&sort=targetIrrPct&order=desc
{
  "data": [
    {
      "id": "fund_northwind_iv",
      "name": "Northwind Buyout Fund IV",
      "manager": "Northwind Capital Partners",
      "strategy": "Private Equity",
      "region": "North America",
      "vintage": 2025,
      "stage": "open",
      "currency": "USD",
      "fundSize": 850000000,
      "minInvestment": 250000,
      "targetIrrPct": 18.0,
      "managementFeePct": 2.0,
      "carryPct": 20.0,
      "investmentPeriodYears": 5,
      "fundTermYears": 10,
      "closeDate": "2026-12-15",
      "summary": "…",
      "highlights": ["…"]
    }
  ],
  "meta": { "page": 1, "pageSize": 25, "total": 5, "totalPages": 1 }
}
```

---

## Commitments (the investor's investments)

### `GET /commitments`
Filters: `status` (`active` | `pending_close`), `fundId`.
Supports sort + pagination. Sortable fields include `committed`, `called`,
`distributed`, `nav`, `netIrrPct`, `netMoic`, `dateCommitted`.

> `nav`, `netIrrPct`, `netMoic`, and `netDpi` may be `null` on a commitment that
> hasn't been valued yet (e.g. one that's pending close). Handle that in the UI.

```jsonc
{
  "data": [
    {
      "id": "cm_0001",
      "fundId": "fund_silverpeak_v",
      "fundName": "Silverpeak Growth Equity V",
      "manager": "Silverpeak Growth",
      "strategy": "Growth Equity",
      "committed": 2000000,
      "called": 1400000,
      "distributed": 520000,
      "nav": 1680000,
      "dateCommitted": "2022-09-12",
      "status": "active",
      "netIrrPct": 19.4,
      "netMoic": 1.57,
      "netDpi": 0.37
    }
  ],
  "meta": { "page": 1, "pageSize": 25, "total": 6, "totalPages": 1 }
}
```

### `GET /commitments/:id`
Returns a single commitment, or `404`.

### `POST /funds/:id/commitments`
Commit capital to a fund. **This is the primary write for the modal/form task.**

Request body:
```json
{
  "amount": 300000,
  "acknowledgedTerms": true
}
```

Validation:
- `amount` — required, positive number, and `>= fund.minInvestment`.
- `acknowledgedTerms` — must be `true`.

Responses:
- `201` — the newly created commitment (status `pending_close`). It will appear
  in subsequent `GET /commitments` calls.
- `400` — `{ "error": "...", "fields": { "amount": "Minimum commitment…" } }`
- `404` — unknown fund id.
- `409` — the fund is `closed` to new commitments.

---

## Notes

- **State is in-memory.** Commitments you create persist until the server
  restarts, then reset to the seed data.
- **No authentication.** Treat the data as belonging to a single signed-in user.
- **CORS is open**, so you can run your front end on any port (e.g. Vite on
  `5173`, CRA on `3000`).
