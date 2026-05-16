/**
 * Install Alfred's nightly Dream task as a v2 recurring task on a dedicated
 * `dreams` thread_id. Uses the same primitives as setup/migrate-v2/tasks.ts
 * but inserts a single hand-crafted task instead of porting v1 rows.
 *
 * Idempotent: re-running checks for an existing task with the same series id
 * and skips. To re-run with a fresh prompt, cancel the existing task first
 * (DELETE FROM messages_in WHERE id='task-alfred-dreams' OR series_id=
 * 'task-alfred-dreams') or use the schedule MCP tools' update_task.
 *
 * Usage: pnpm exec tsx scripts/install-alfred-dreams.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DIR } from '../src/config.js';
import { initDb, closeDb } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations/index.js';
import { insertTask } from '../src/modules/scheduling/db.js';
import { openInboundDb, resolveSession } from '../src/session-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TASK_ID = 'task-alfred-dreams';
const RECURRENCE = '0 3 * * *'; // 03:00 Europe/Berlin
const PROMPT_PATH = path.join(__dirname, 'alfred-dreams-prompt.md');

const AGENT_GROUP_ID = 'ag-1778000047238-6jof7h'; // Alfred
const MESSAGING_GROUP_ID = 'mg-1778000047239-pol4yy'; // whatsapp:491633456809@s.whatsapp.net
const DREAM_THREAD_ID = 'dreams';

function nextRunUtc(cron: string): string {
  // Approximate: 03:00 today Europe/Berlin → UTC. If past, schedule for tomorrow.
  // Cheap because we only support '0 3 * * *' here.
  if (cron !== '0 3 * * *') {
    throw new Error(`unsupported cron for naive scheduling: ${cron}`);
  }
  const now = new Date();
  const target = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 1, 0, 0),
  );
  // Berlin is UTC+1 (winter) or UTC+2 (summer DST). 03:00 local = 02:00 UTC (winter) or 01:00 UTC (summer).
  // Use 01:00 UTC year-round; v2's task scheduler interprets recurrence in TZ Europe/Berlin so the actual
  // fire time will be re-aligned. processAfter only matters for the FIRST occurrence — recurrence drives
  // subsequent.
  if (target <= now) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target.toISOString();
}

function main(): void {
  const prompt = fs.readFileSync(PROMPT_PATH, 'utf-8');
  if (prompt.length < 200) {
    throw new Error(`dream prompt too short (${prompt.length} chars) — bad path?`);
  }

  const v2DbPath = path.join(DATA_DIR, 'v2.db');
  if (!fs.existsSync(v2DbPath)) {
    throw new Error(`v2.db not found at ${v2DbPath}`);
  }
  const v2Db = initDb(v2DbPath);
  runMigrations(v2Db);

  const { session } = resolveSession(
    AGENT_GROUP_ID,
    MESSAGING_GROUP_ID,
    DREAM_THREAD_ID,
    'per-thread',
  );
  console.log(`session: ${session.id} (thread_id=${DREAM_THREAD_ID})`);

  const inboxDb = openInboundDb(AGENT_GROUP_ID, session.id);
  try {
    const existing = inboxDb
      .prepare("SELECT id, status, recurrence FROM messages_in WHERE (id = ? OR series_id = ?) AND kind = 'task'")
      .all(TASK_ID, TASK_ID) as Array<{ id: string; status: string; recurrence: string | null }>;
    if (existing.length > 0) {
      console.log(
        `OK:exists count=${existing.length} statuses=${existing.map((r) => r.status).join(',')}`,
      );
      console.log('To replace, cancel first or use the schedule MCP tools.');
      return;
    }

    insertTask(inboxDb, {
      id: TASK_ID,
      processAfter: nextRunUtc(RECURRENCE),
      recurrence: RECURRENCE,
      platformId: '491633456809@s.whatsapp.net',
      channelType: 'whatsapp',
      threadId: DREAM_THREAD_ID,
      content: JSON.stringify({ prompt }),
    });
    console.log(`OK:inserted id=${TASK_ID} recurrence='${RECURRENCE}' session=${session.id}`);

    // Intentionally do NOT seed `michael-dm` in this session. The dream task
    // must not send WhatsApp messages at 3 AM — without a destination wired,
    // any send_message call fails with "No destinations configured", which is
    // the structural guard. The morning-task (separate main-session task at
    // 06:00) reads /workspace/agent/dream-report-latest.md and delivers the
    // summary.
    const stale = inboxDb
      .prepare("SELECT 1 FROM destinations WHERE name = 'michael-dm'")
      .get();
    if (stale) {
      inboxDb.prepare("DELETE FROM destinations WHERE name = 'michael-dm'").run();
      console.log('OK:removed stale michael-dm destination from dream session');
    }
  } finally {
    inboxDb.close();
    closeDb();
  }
}

main();
