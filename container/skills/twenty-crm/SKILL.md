---
name: twenty-crm
description: Twenty CRM (Open-Source CRM) für team:orange unter `https://crm.teamorange.de`. Use whenever Michael fragt nach Companies, Persons (Contacts), Opportunities, Notes oder Activities in seiner CRM-Pipeline. Twenty exposed sowohl REST als auch GraphQL — beide via Bearer-Token-Auth. Auth ist via OneCLI gateway transparent gemanagt.
---

# Twenty CRM Skill (team:orange)

Twenty ist team:orange's CRM unter `https://crm.teamorange.de`. Modelle: Companies, People, Opportunities, Notes, Tasks, Custom Objects.

## Auth + Endpoints

REST: `https://crm.teamorange.de/rest/...`  
GraphQL: `https://crm.teamorange.de/graphql`  

OneCLI injiziert `Authorization: Bearer <token>` automatisch. Zwei Endpoint-Stile:

```bash
# REST-Style — bevorzugt für simple CRUD
curl -s "https://crm.teamorange.de/rest/people?filter[firstName][eq]=Michael"

# GraphQL — wenn du verschachtelte Daten brauchst
curl -s -X POST "https://crm.teamorange.de/graphql" \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ people(first: 5) { edges { node { id firstName lastName email } } } }"}'
```

## Schema-Highlights (REST)

| Resource | Endpoint | Felder (Auswahl) |
|---|---|---|
| Companies | `/rest/companies` | id, name, domainName, employees, accountOwnerId, address |
| People | `/rest/people` | id, firstName, lastName, email, phone, jobTitle, companyId |
| Opportunities | `/rest/opportunities` | id, name, amount, stage (NEW/SCREENING/MEETING/PROPOSAL/CUSTOMER), closeDate |
| Notes | `/rest/notes` | id, title, body, targetObjectId, targetObjectName |
| Tasks | `/rest/tasks` | id, title, body, status, dueAt, assigneeId |

Twenty REST nutzt Filter-Syntax `?filter[<field>][<op>]=<value>` mit Ops `eq`, `neq`, `gt`, `lt`, `like`, `in`. Sort: `?orderBy=createdAt[DescNullsLast]`. Pagination: `?startingAfter=<cursor>&limit=50`.

## Cookbook

### Alle Companies auflisten

```bash
curl -s "https://crm.teamorange.de/rest/companies?limit=50&orderBy=name[AscNullsLast]" \
  | jq '.data.companies[] | {id, name, domainName}'
```

### Person by Email finden

```bash
EMAIL="kunde@example.com"
curl -s "https://crm.teamorange.de/rest/people?filter[email][eq]=$EMAIL" \
  | jq '.data.people[0] // empty | {id, firstName, lastName, companyId}'
```

### Opportunities im Funnel (offen)

```bash
curl -s "https://crm.teamorange.de/rest/opportunities?filter[stage][in]=NEW,SCREENING,MEETING,PROPOSAL&limit=50" \
  | jq '.data.opportunities[] | {name, amount: .amount.amountMicros, stage, closeDate}'
```

### Note an eine Person hängen (write — ASK-FIRST)

```bash
curl -s -X POST "https://crm.teamorange.de/rest/notes" \
  -H 'Content-Type: application/json' \
  -d '{"title":"<title>","body":"<markdown>","targetObjectId":"<person-id>","targetObjectName":"person"}'
```

## Hard Rules

- **Reads unrestricted**
- **Writes ASK-FIRST** — speziell:
  - Opportunities anlegen/ändern (Stage-Transitions sind oft pipeline-relevant)
  - Notes an Customers/People hängen (auch wenn intern — Trail in der CRM-Historie)
  - Companies/People ändern (Kontaktdaten-Updates → ggf. Customer-Konsequenz)
- **Nie Delete** — Twenty hat Soft-Delete-Pattern, aber per UI rückgängig zu machen ist umständlich. Auf explizite Doppelbestätigung warten.
- **Webhooks + Custom Objects** kannst du auf Anfrage erkunden — ist customer-spezifisch erweitert.
