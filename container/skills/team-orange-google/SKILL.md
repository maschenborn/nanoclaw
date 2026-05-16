---
name: team-orange-google
description: Google Analytics 4 + Google Search Console für team:orange-Properties (towebserver@gmail.com Account). Use whenever Michael fragt nach Web-Traffic-Daten, Search-Performance, Top-Queries, Page-Views, Bounce-Rate etc. für die team:orange-Domains (z.B. teamorange.de). Auth läuft via OneCLI Apps mit explizitem Account-Mapping `towebserver@gmail.com` auf den Timo-Agent (anders als Alfred/Elfi-Google-Identitäten).
---

# team:orange Google (Analytics + Search Console)

Timo's Google-Identität für team:orange-Webanalyse ist **`towebserver@gmail.com`** (verschieden von Michaels privatem `m.aschenborn@gmail.com` und der LAZI-Domain). OneCLI hat den Account separat verbunden und routed alle googleapis.com-Calls aus deinem Container über diesen Bearer-Token.

## Identity-Check

**Wichtig**: in OneCLI ist jede Google-App separat einem Account zugewiesen. Gmail-App kann an einen Account gebunden sein, Search Console an einen anderen, Analytics wieder an einen anderen — alles legitim. Der einzige verlässliche Identity-Check ist die *konkrete API die du gleich benutzt*.

Für Search Console: site-Liste abfragen und schauen ob die erwarteten team:orange-Kunden-Properties drin sind:

```bash
curl -s "https://searchconsole.googleapis.com/webmasters/v3/sites" \
  | jq '.siteEntry[] | {siteUrl, permissionLevel}'
```

Sollte u.a. zeigen (Stand 2026-05-16): `dobmeier.gmbh`, `ps-los-sparen.de`, `aurea.solutions`, `fuell-labautomation.com` als `siteOwner`. Wenn die nicht da sind oder die Liste ganz anders aussieht → wahrscheinlich falscher Account-Bind. Michael soll im OneCLI-UI prüfen welcher Google-Account für Search Console an Timo zugewiesen ist (sollte `towebserver@gmail.com` sein).

Für Analytics Admin entsprechend: `accounts`-Liste abfragen und mit erwarteten team:orange-Properties vergleichen.

**Nicht** `https://gmail.googleapis.com/gmail/v1/users/me/profile` als Identity-Check verwenden — das zeigt eine andere App-Bindung (oft ein anderer Account!) und ist irreführend. Auch nicht `/oauth2/v2/userinfo` — der hat in OneCLI kein Provider-Mapping und gibt `access_restricted`.

## Google Search Console

Top-Queries, Impressions, Klicks, Position für jede Property die towebserver@gmail.com als Owner hat.

### Sites listen

```bash
curl -s "https://searchconsole.googleapis.com/webmasters/v3/sites" | jq '.siteEntry[] | {siteUrl, permissionLevel}'
```

### Search-Analytics-Query

```bash
SITE="https%3A%2F%2Fteamorange.de%2F"   # URL-encoded
END=$(date -u -d 'yesterday' +%Y-%m-%d)
START=$(date -u -d '8 days ago' +%Y-%m-%d)

curl -s -X POST \
  -H "Content-Type: application/json" \
  "https://searchconsole.googleapis.com/webmasters/v3/sites/$SITE/searchAnalytics/query" \
  -d "{\"startDate\":\"$START\",\"endDate\":\"$END\",\"dimensions\":[\"query\"],\"rowLimit\":20}" \
  | jq '.rows | sort_by(-.clicks) | .[0:10] | .[] | {query: .keys[0], clicks, impressions, ctr: (.ctr * 100 | round / 100), position: (.position * 100 | round / 100)}'
```

Andere Dimensions:
- `["page"]` — Top-Pages
- `["country"]` — Geo
- `["device"]` — desktop / mobile / tablet
- `["query","page"]` — Combo

Filter z.B. Performance pro URL:
```bash
-d "{...,\"dimensionFilterGroups\":[{\"filters\":[{\"dimension\":\"page\",\"operator\":\"contains\",\"expression\":\"/blog/\"}]}],\"dimensions\":[\"query\"]}"
```

## Google Analytics 4 (GA4)

GA4 nutzt die `analyticsdata` API. Du brauchst die numerische **Property-ID** (z.B. `312345678`) — Michael trägt die in `/workspace/agent/projects.md` ein. Frag ihn beim ersten Mal danach, danach merkst du dir das aus dem Workspace.

> ℹ️ **`analyticsadmin.googleapis.com` (Properties-Liste) hat in OneCLI aktuell kein Mapping**. Frag nicht das, sondern operiere direkt auf `analyticsdata.googleapis.com` mit den bekannten Property-IDs. Wenn Michael eine neue Property dazugibt, sagt er dir die ID — du listest sie nicht via Admin-API.

### Standard-Report (gestern, Top-Pages by Pageviews)

```bash
PROPID=<numeric-property-id>
curl -s -X POST \
  -H "Content-Type: application/json" \
  "https://analyticsdata.googleapis.com/v1beta/properties/$PROPID:runReport" \
  -d '{
    "dateRanges": [{"startDate": "yesterday", "endDate": "yesterday"}],
    "dimensions": [{"name": "pagePath"}],
    "metrics": [{"name": "screenPageViews"}, {"name": "totalUsers"}],
    "orderBys": [{"metric": {"metricName": "screenPageViews"}, "desc": true}],
    "limit": 10
  }' | jq '.rows[] | {page: .dimensionValues[0].value, views: .metricValues[0].value, users: .metricValues[1].value}'
```

Common metrics: `activeUsers`, `newUsers`, `sessions`, `screenPageViews`, `engagementRate`, `averageSessionDuration`, `bounceRate`.  
Common dimensions: `pagePath`, `country`, `sessionSource`, `deviceCategory`, `eventName`.

### Realtime (last 30 minutes)

```bash
curl -s -X POST \
  -H "Content-Type: application/json" \
  "https://analyticsdata.googleapis.com/v1beta/properties/$PROPID:runRealtimeReport" \
  -d '{
    "dimensions": [{"name": "country"}],
    "metrics": [{"name": "activeUsers"}]
  }' | jq
```

## Hard Rules

- **Reads only**. Analytics + Search Console sind read-only von ihrer Natur — du veröffentlichst da nichts. Falls Michael Daten irgendwohin (Mail/Chat) leakt, klare Quellen-Angabe: "GA4-Property X, GSC-Property Y, Zeitraum Z".
- **PII-light**: Analytics-Daten sind aggregiert. Falls du auf einen `userId`-Filter triffst, das ist GA4's interner User-ID nicht Customer-PII.
- **API-Quota beachten**: Analytics 4 Data API hat 50K-200K requests/day quota pro Property; bei großen Reports `--paginate` mit `limit`+`offset` und `dimensionsFilters` benutzen statt naive Massen-Queries.
- **Wenn SERVICE_DISABLED 403 mit Projekt `311791545398`**: Search-Console-API oder Analytics-Data-API ist im OneCLI-OAuth-Projekt nicht aktiv. Michael auffordern, in Cloud Console `https://console.cloud.google.com/apis/library/<API>.googleapis.com?project=gen-lang-client-0132377876` zu aktivieren. Nicht selbst umgehen.
