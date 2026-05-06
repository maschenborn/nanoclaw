---
name: invoiceninja
description: Read and modify Michael's InvoiceNinja install (self-hosted at rechnung.aschenborn.net). Use whenever Michael asks about clients, invoices, payments, products, projects, expenses, or quotes — e.g. "wer schuldet mir noch was?", "was hat LAZI dieses Jahr gezahlt?", "Stand Rechnung X?", "wer ist mein Top-Kunde?", "letzte Zahlung von Y?". Also use when he wants to **create** invoices ("mach LAZI ne Rechnung über DiMe Februar", "leg ne Rechnung für Kunde Z mit Position X an"), record payments, or send reminders. Authentication is handled transparently by the OneCLI gateway — no token in your code.
---

# InvoiceNinja Skill

Michael runs his own InvoiceNinja v5 install at `https://rechnung.aschenborn.net` for freelance billing. This is his **production accounting system** — every action you take here may show up on an invoice, in his books, and in a client mailbox.

A `InvoiceNinja` API token is stored in OneCLI with host-pattern `rechnung.aschenborn.net` and header `X-Api-Token`. Any HTTPS request you make to that host gets the token injected automatically — you call the API with `curl` / `fetch` without any auth handling.

## Scope distinction — important

| | What's safe | What needs explicit per-action approval |
|---|---|---|
| **Reads** | balances, invoice lists, client lookups, payment history, product catalogue, project status, total outstanding | — |
| **Writes** | — | creating invoices, sending invoices, recording payments, archiving, modifying clients/products, deleting anything |

**Reading is always fine on request.** Even for "read-then-tell" flows (e.g. "wer schuldet mir noch was?") just answer.

**Writes are ask-first, every single time.** Don't auto-create even when the request seems unambiguous. The flow is always:

1. Build a **draft** locally (compute the numbers, look up IDs, write an internal preview)
2. Show Michael a summary on WhatsApp: *"Entwurf:* `Rechnung an LAZI Akademie, 4× DiMe (5./6.Sem.) à 80 €, gesamt 320 €, Datum 06.05.2026, fällig 20.05.2026.` *Erstellen?"*
3. Wait for explicit *"ja"* / *"erstellen"* / *"go"*
4. Then POST. Tell Michael the result + invoice number.

**Sending the invoice via email is a SECOND ask** ("Soll ich sie auch direkt an dagmar.lazi@... rausschicken?") — never combined with the create-step.

## Michael's setup quirks (verified 2026-05-06)

- **Currency**: EUR (`currency_id: 3` on the company)
- **VAT**: Kleinunternehmer — `vat_number` empty, every existing line item has `tax_rate1: 0`. **Never put a tax rate > 0 on a new line item** unless Michael verbatim asks for it. Default to `tax_rate1: 0`.
- **Existing clients (2)**:
  - `media GmbH` — id `VolejRejNm`, contacts incl. `aschmidt@media-gmbh.de`, `rechnung@media-gmbh.de`
  - `LAZI Akademie gGmbH` — id `Wpmbk5ezJn`, contact `dagmar.lazi@lazi-akademie.de`
- **Product catalogue (13 products)**: e.g. `DiMe (5./6.Sem.)` (€80/Termin), `KI Planung mit Philip` (€30), `Bootstrap` (€30). Each line item is typically one termin/session with the date in `notes` (e.g. `"03. Juni 2025"`). Duplicate-keyed line items are normal — same product on different days = multiple line items.
- **Numbering**: invoice numbers are `0001`, `0002`, ... — InvoiceNinja auto-increments; don't set `number` manually on create.
- **Payment terms**: defaults from company settings (typically 14 days).

When in doubt about format/structure, **fetch a recent invoice for the same client** (`GET /api/v1/invoices?per_page=5&client_id=<id>`) and mirror its `line_items` shape and tax fields.

## The REST API

Base URL: `https://rechnung.aschenborn.net/api/v1`

Docs: <https://api-docs.invoicing.co/>

### Reads — common recipes (use `curl -s` in Bash, pipe through `jq`)

```bash
IN=https://rechnung.aschenborn.net

# Health / sanity
curl -s $IN/api/v1/ping

# All clients (compact)
curl -s "$IN/api/v1/clients?per_page=20" | jq '.data[] | {id, display_name, balance, paid_to_date}'

# Find a client by name keyword
curl -s "$IN/api/v1/clients?per_page=50" | jq --arg q "lazi" '.data[] | select(.display_name | ascii_downcase | contains($q | ascii_downcase)) | {id, display_name, balance}'

# Outstanding invoices (balance > 0, not draft, not cancelled)
curl -s "$IN/api/v1/invoices?per_page=50&client_status=outstanding" \
  | jq '.data[] | select(.balance>0 and (.is_deleted|not) and .status_id!="5") | {number, client_id, amount, balance, due_date, days_overdue: ((now - (.due_date | strptime("%Y-%m-%d") | mktime)) / 86400 | floor)}'

# Total outstanding (sum)
curl -s "$IN/api/v1/invoices?per_page=100&client_status=outstanding" \
  | jq '[.data[] | select(.balance>0 and (.is_deleted|not) and .status_id!="5") | .balance] | add'

# Invoices for one client
curl -s "$IN/api/v1/invoices?client_id=Wpmbk5ezJn&per_page=20" | jq '.data[] | {number, status_id, amount, balance, date, due_date}'

# Recent payments
curl -s "$IN/api/v1/payments?per_page=10&sort=date|desc" | jq '.data[] | {date, amount, transaction_reference, client_id, invoices: [.paymentables[]?.invoice_id]}'

# Product catalogue
curl -s "$IN/api/v1/products?per_page=50" | jq '.data[] | {id, product_key, price, notes}'

# One specific invoice — full detail (line items, taxes, etc.)
curl -s "$IN/api/v1/invoices?per_page=10" | jq '.data | map(select(.number=="0006"))[0]'
```

### Status code lookup

`status_id` on invoices:

| id | meaning |
|---|---|
| 1 | Draft |
| 2 | Sent |
| 3 | Partial |
| 4 | Paid |
| 5 | Cancelled |

Filter `client_status` in queries: `draft | paid | unpaid | overdue | reversed | cancelled` plus `outstanding` (sent or partial).

### Currency / amount handling

Amounts in InvoiceNinja are **decimal numbers in the company currency**, not minor units. `cost: 80` = €80,00. `paid_to_date: 5315` = €5.315,00.

When you state amounts to Michael in WhatsApp, format with `€` and German thousand-separators: `*€ 2.300,00*`. Do not invent decimal precision (the API stores 2 decimals).

## Writes — invoice creation (the most common write)

POST `/api/v1/invoices` with this minimal body. **Tax_rate1=0 is non-negotiable** for Michael unless he explicitly says otherwise:

```bash
curl -s -X POST $IN/api/v1/invoices \
  -H 'Content-Type: application/json' \
  -d '{
    "client_id": "Wpmbk5ezJn",
    "date": "2026-05-06",
    "due_date": "2026-05-20",
    "line_items": [
      {
        "product_key": "DiMe (5./6.Sem.)",
        "notes": "12. Mai 2026",
        "cost": 80,
        "quantity": 1,
        "tax_name1": "",
        "tax_rate1": 0
      },
      {
        "product_key": "DiMe (5./6.Sem.)",
        "notes": "19. Mai 2026",
        "cost": 80,
        "quantity": 1,
        "tax_name1": "",
        "tax_rate1": 0
      }
    ]
  }'
```

The response includes the new invoice's `id`, `number`, `amount`, etc. **Show Michael the number** ("Rechnung *0007* angelegt — €160,00 brutto").

The new invoice is created in `status_id: 1` (Draft) — Michael now has it in his InvoiceNinja UI to review. **It is NOT sent to the client yet.** That's a separate step.

### Send invoice via email (the second ask)

```bash
curl -s -X POST $IN/api/v1/invoices/<invoice_id>/email \
  -H 'Content-Type: application/json' \
  -d '{}'
```

This sends the invoice PDF to all client contacts via the email address configured in InvoiceNinja (Michael's outbound mail there). Always ask Michael first: *"Soll ich die Rechnung jetzt direkt an dagmar.lazi@lazi-akademie.de rausschicken?"* — only fire on explicit confirm.

### Mark a payment manually

POST `/api/v1/payments`:

```bash
curl -s -X POST $IN/api/v1/payments \
  -H 'Content-Type: application/json' \
  -d '{
    "client_id": "Wpmbk5ezJn",
    "amount": 2300,
    "date": "2026-05-06",
    "transaction_reference": "Banküberweisung 2026-05-06",
    "type_id": "1",
    "invoices": [{"invoice_id": "<invoice-uuid>", "amount": 2300}]
  }'
```

`type_id`: 1=Manual entry, 5=Bank transfer, 12=PayPal — see `/api/v1/statics` for the list. Default to **1** (manual entry) unless Michael specifies.

### Other writes

| Action | Endpoint | Notes |
|---|---|---|
| Create client | `POST /api/v1/clients` | needs `name` + at least one `contacts: [{email}]` entry |
| Update invoice (e.g. add line item, fix typo) | `PUT /api/v1/invoices/<id>` | full replace of editable fields |
| Archive invoice | `DELETE /api/v1/invoices/<id>?action=archive` | reversible — keep this preferred over hard delete |
| Cancel invoice | `POST /api/v1/invoices/<id>?action=cancel` | sets status to 5; visible to client if already sent |
| Send reminder | `POST /api/v1/invoices/<id>/email` with `template: "reminder1"` | escalation — extra-careful ask |

## Common workflows

### Workflow — "wer schuldet mir noch was?"

1. `GET /api/v1/invoices?client_status=outstanding&per_page=50`
2. Filter to `balance > 0`
3. Group by client, show in WhatsApp format

```
*Offene Rechnungen (€ 2.300,00 gesamt)*
• LAZI Akademie #0006: € 2.300,00 — fällig 22.09.25 (231 Tage überfällig)
```

### Workflow — "mach LAZI ne Rechnung über DiMe Februar"

1. **Look up the client**: `GET /api/v1/clients?per_page=20` → match `lazi` → id `Wpmbk5ezJn`
2. **Look up the product**: `GET /api/v1/products?per_page=50` → find `DiMe (5./6.Sem.)` → cost €80
3. **Ask Michael for which dates / how many sessions** if he didn't tell you. *"Welche Termine im Februar? Z.B. wöchentliche DiMe-Termine?"*
4. **Build the draft** in your head (or write it as a list in `<internal>`):
   - 4 line items (one per Februar-Termin), each €80, tax 0
   - Date: today; Due_date: today + 14 days
5. **Show summary, ask:**
   ```
   *Rechnungs-Entwurf — LAZI Akademie*
   • DiMe 04.02.2026 — €80,00
   • DiMe 11.02.2026 — €80,00
   • DiMe 18.02.2026 — €80,00
   • DiMe 25.02.2026 — €80,00
   _Gesamt: €320,00, fällig 20.05.2026_
   Erstellen?
   ```
6. On `ja`: POST, capture `id` + `number`, report.
7. On `ja, schick auch raus`: separate email POST, report.

### Workflow — "ist die LAZI-Zahlung vom 01.01. mit Rechnung 0006 verknüpft?"

1. `GET /api/v1/payments?per_page=10&sort=date|desc`
2. Find the 2.600 €-Zahlung — check its `paymentables[]`
3. If `paymentables` doesn't include invoice 0006: zahlung ist freistehend / oder gegen andere Rechnung gebucht
4. Tell Michael; if he wants to assign, that's a `PUT /api/v1/payments/<id>` with the new `paymentables` list — ASK FIRST (changes accounting).

## Hard rules

1. **Reads always OK on request, writes always ASK-FIRST**, even when the request feels unambiguous. The risk is non-trivial: a wrong invoice in production can confuse a client, a wrong payment-link miscounts revenue.
2. **Never set `tax_rate1` > 0** on a new line item unless Michael verbatim says "mit MwSt" or similar. Michael is Kleinunternehmer; `0` is the established pattern.
3. **Never auto-send an invoice email** — it ALWAYS lands in a client's mailbox and represents a commitment. Two-step gate: create-then-confirm-then-send, never one-shot.
4. **Don't fabricate line-item dates or notes**. Each line item should reflect a real session/delivery date. If Michael's request is vague ("vier Termine im Februar"), ASK for the specific dates.
5. **Never `DELETE` (hard delete) an invoice** — use `?action=archive` instead. Hard deletes break the audit trail.
6. **Tell Michael the resulting invoice number** after every successful create. ("Rechnung *0007* erstellt — €320,00") That's his hook for double-checking in the InvoiceNinja UI.
7. **Don't auto-mark payments based on intuition** ("LAZI hat ja eh schon 2.600 € gezahlt, ich verknüpf das mit 0006") — payment assignments are accounting decisions, ask Michael.

## How to respond in WhatsApp

- Currency: `€ 1.234,56` (German format, thin space optional)
- Dates: German `DD.MM.YYYY`
- Use `*bold*` for invoice numbers, client names, totals
- Bullet `•` for line lists (one item per line)
- Status keywords: `Draft`/`Entwurf`, `Sent`/`Versendet`, `Partial`/`Teilbezahlt`, `Paid`/`Bezahlt`, `Cancelled`/`Storniert`. Say it in German.
- Days overdue: `*231 Tage überfällig*` (red flag) — for ≥ 30 days, mention it; under 30 days, just give the due date.

## Failure handling

- `403 "Invalid token"`: OneCLI didn't inject (or was injected with wrong header — should be `X-Api-Token`). Tell Michael; check with `onecli secrets list`.
- `422` validation error: response body has `errors: {field: [...messages]}`. Read it, adjust the payload, retry only after fixing — don't loop blindly.
- `404 not found`: client_id / invoice_id wrong. Probably a typo in your lookup — re-list and try again.
- `500`: InvoiceNinja itself is borked. Tell Michael, check `/api/v1/ping` for aliveness.

## What this skill does NOT do

- Generate PDFs locally (InvoiceNinja does that on send/download — don't try to compose PDFs)
- Sync to external accounting systems (DATEV, Lexoffice, etc.)
- Track time entries autonomously (use the dedicated `tasks` endpoint with explicit Michael instruction)
- Cross-link with PhoenixDMS — that's a separate skill territory; don't auto-archive InvoiceNinja-generated invoices into DMS unless Michael asks
