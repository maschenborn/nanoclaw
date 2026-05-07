---
name: dime-trainer
description: Architektur + Implementation für die `dime-trainer`-Lern-PWA — eine progressive Web-App für die DIME-Studierenden mit AI-gestütztem Frage-Antwort-Modul (Gemini), Knowledge-Articles und (in Phase 5) Classroom-Sync. Use whenever Michael Fragen zu dime-trainer hat: Stack, Phasen-Status, Supabase-Tabellen (mit `dt_`-Präfix), Auth-Flow, Gemini-SSE-Integration, PWA-Setup. Schreibst auch Code-Snippets in dem Stack (Next 16 + Tailwind 4 + Bun + Supabase).
---

# DIME-Trainer Skill

Lern-PWA für die DIME-Studierenden der LAZI Akademie. AI-gestütztes Q&A, Knowledge-Articles, Phasen-orientierter Lernpfad. Einigermaßen anders als `lazi.works`:

| | lazi.works | dime-trainer |
|---|---|---|
| Zweck | Public Portfolio | Lern-Tool für Studierende |
| ORM | Prisma 6 | **kein Prisma** — direkter Supabase-Client mit RLS |
| UI | MUI 7 | Tailwind 4 |
| Tabellen | normal | alle mit `dt_`-Präfix (gleiche Supabase-Instanz, namespace-getrennt) |

**Repo (Mac)**: `~/Projects/lazi/dime-trainer/`. Branch `main`. Im Hetzner-Container: kein direkter Zugriff — Code-Änderungen über Michaels lokale Umgebung.

## Stack

- **Next.js 16.1.6** + React 19, App Router
- **Tailwind 4**
- **Bun** als Runtime + Package Manager
- **Supabase** (gleiche Instanz wie lazi.works → `yrhjahpxwyflwoaqtgrt.supabase.co`)
  - Alle Tabellen mit `dt_`-Präfix für Namespace-Trennung
  - RLS (Row-Level Security) als alleinige Auth-Schicht
  - **Kein Prisma** — direkter `@supabase/supabase-js`-Client
- **AI**: Gemini 2.0 Flash mit SSE-Streaming
- **PWA**: `@ducanh2912/next-pwa` (anders als lazi.works das Workbox direkt nutzt)
- **Auth**: Google OAuth via Supabase Auth
  - Workspace-Restricted: nur `@lazi-akademie.de`-Adressen
  - `hd`-Claim-Check + zusätzlicher Middleware-Check

## Phasen-Status (Stand 2026-05-04)

| Phase | Status | Inhalt |
|---|---|---|
| 1 | ✅ done | Auth + Basis-UI + Supabase-Schema |
| 2 | ✅ done | Knowledge-Articles (Lesen, Markdown-Rendering, Suche) |
| 3 | ✅ done | Q&A-Modul mit Gemini-Streaming-Antworten |
| 4 | ✅ done | Phasen-orientierter Lernpfad (Progress-Tracking) |
| **5** | 🔧 **offen** | Offline-Modus + Classroom-Sync (importiert Aufgaben/Posts aus Google Classroom) |

Phase 5 ist die nächste Baustelle wenn Michael wieder dran arbeitet.

## Datenbank — `dt_`-Tabellen (Schema in Supabase)

Alle Tabellen prefix `dt_`. Wichtige (aus dem Mac-Repo, mit RLS-Policies):

- `dt_users` — User-Profile (gespiegelt aus `auth.users`)
- `dt_articles` — Knowledge-Articles (Markdown-Body)
- `dt_questions` — Q&A-Einträge (User-Frage + Gemini-Antwort)
- `dt_progress` — pro User pro Phase: was abgeschlossen, was offen
- `dt_classroom_assignments` (Phase 5, geplant) — gespiegelte Aufgaben aus Google Classroom

Schema-Modifikationen über **Supabase-Migrations** (`supabase/migrations/<timestamp>_*.sql`), nicht via Prisma. Bei Schema-Änderung: erst lokale `supabase` CLI, dann `supabase db push`.

## ENV-Variablen

Aus `setup-elfi-secrets.sh` in NanoClaws `.env` gespiegelt:

```env
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...    # nur server-side / Migrations
LAZI_GEMINI_API_KEY=...           # Gemini API für Q&A
```

Für `dime-trainer/.env.local` bei Michael lokal:

```env
NEXT_PUBLIC_SUPABASE_URL=https://yrhjahpxwyflwoaqtgrt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service>      # für API-Routes
NEXT_PUBLIC_APP_URL=http://localhost:3000
GEMINI_API_KEY=<gemini>
```

**Niemals `_SERVICE_ROLE_KEY` mit `NEXT_PUBLIC_` prefixen.**

## Gemini-SSE-Streaming-Pattern

Q&A-Modul streamt Antworten via Server-Sent Events. API-Route bei Michael unter `app/api/ask/route.ts` (oder ähnlich). Pattern:

```ts
import { GoogleGenerativeAI } from '@google/generative-ai';
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  const { question, context } = await req.json();
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContentStream([
    { text: `${context}\n\nFrage: ${question}` }
  ]);

  const stream = new ReadableStream({
    async start(controller) {
      for await (const chunk of result.stream) {
        const text = chunk.text();
        controller.enqueue(`data: ${JSON.stringify({ text })}\n\n`);
      }
      controller.enqueue('data: [DONE]\n\n');
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
```

Frontend (Hook): konsumiert via `EventSource` oder fetch+ReadableStream.

## Auth-Flow

Google OAuth via Supabase mit Workspace-Restriction:

1. Supabase-Auth-Provider Google konfiguriert (im Supabase-Dashboard)
2. OAuth-Client mit `hd=lazi-akademie.de` parameter (im Auth-URL)
3. Middleware (`middleware.ts`) prüft `user.email.endsWith('@lazi-akademie.de')` + redirect auf `/login` falls nicht

Doppelter Schutz: Google selbst limitiert auf Workspace-Domain (via `hd`), und unser Middleware-Check als Hosengürtel.

## PWA-Setup

`@ducanh2912/next-pwa` (vs Workbox direkt bei lazi.works) — leichtere DX:

```ts
// next.config.ts
import withPWA from '@ducanh2912/next-pwa';

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  // ...
})({
  // Next.js config
});
```

Manifest in `public/manifest.json`. Service-Worker auto-generiert.

## Hard rules

1. **Tabellen-Prefix `dt_`**: alle Schema-Änderungen müssen das einhalten — sonst Konflikt mit `lazi.works`-Tabellen in der gemeinsamen DB
2. **RLS ist die Auth**: keine zusätzliche serverseitige `auth.uid()`-Logik in API-Routes — RLS regelt
3. **Workspace-Restriction**: niemals den `hd`-Check entfernen — würde DIME-Studenten exponieren für externe Anmeldungen
4. **Supabase-Migrations linear**: keine parallelen Branches mit eigenen Migrations — sonst Drift in der DB

## Failure handling

- **Gemini 429** rate-limit: Backoff in der API-Route, User-Notice „kurz warten". Bei systematischer Überlast: Tier upgraden.
- **Supabase-RLS-Reject**: Frontend bekommt `null` oder leere Liste obwohl Daten da sind. Im Dashboard die RLS-Policies prüfen — meistens fehlt eine `using/with check` Klausel.
- **PWA-Service-Worker stuck**: User-Browser hat alte SW-Version gecached. Force-update via `?refresh=1` im URL oder in DevTools `Update on reload`.

## Was diese Skill NICHT macht

- **Direkt am Mac-Repo arbeiten**: kein Zugriff aus dem Container. Code-Vorschläge an Michael formulieren.
- **Production-Deploy**: bei Bedarf via Vercel manuell durch Michael.
- **DB-Schema-Migrations ohne Review**: erst Supabase-CLI lokal testen, dann Mike bestätigen lassen.
