/**
 * Install Elfi's nightly self-diagnosis task as a v2 recurring task on a
 * dedicated `diagnose` thread_id. Mirrors install-alfred-dreams.ts.
 *
 * Idempotent: re-running checks for an existing task with the same series id
 * and skips. To re-run with a fresh prompt, cancel the existing task first
 * (DELETE FROM messages_in WHERE id='task-elfi-diagnose' OR series_id=
 * 'task-elfi-diagnose') in the diagnose session's inbound.db.
 *
 * Usage: pnpm exec tsx scripts/install-elfi-diagnose.ts
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

const TASK_ID = 'task-elfi-diagnose';
const RECURRENCE = '30 3 * * *'; // 03:30 Europe/Berlin (offset from Alfred's 03:00)
const PROMPT_PATH = path.join(__dirname, 'elfi-diagnose-prompt.md');

const AGENT_GROUP_ID = 'ag-1778163532245-qw4nmf'; // Elfi
const MESSAGING_GROUP_ID = 'mg-1778165794785-0zi5h1'; // gchat:spaces/yM2kqyAAAAE
const DIAGNOSE_THREAD_ID = 'diagnose';
const GCHAT_SPACE = 'spaces/yM2kqyAAAAE';

function nextRunUtc(cron: string): string {
  // Approximate: target HH:MM today Europe/Berlin → UTC. If past, schedule for tomorrow.
  const match = cron.match(/^(\d+) (\d+) \* \* \*$/);
  if (!match) {
    throw new Error(`unsupported cron for naive scheduling: ${cron}`);
  }
  const [, minStr, hourStr] = match;
  const min = Number(minStr);
  const hour = Number(hourStr);

  // Berlin is UTC+1 (winter) or UTC+2 (summer DST). Use UTC-2 offset (CEST) as
  // a starting guess — the v2 task scheduler re-aligns recurrence in TZ
  // Europe/Berlin so the actual fire time will be corrected on the first
  // recurrence tick. processAfter only matters for the FIRST occurrence.
  const now = new Date();
  const target = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour - 2, min, 0),
  );
  if (target <= now) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target.toISOString();
}

function main(): void {
  const prompt = fs.readFileSync(PROMPT_PATH, 'utf-8');
  if (prompt.length < 200) {
    throw new Error(`diagnose prompt too short (${prompt.length} chars) — bad path?`);
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
    DIAGNOSE_THREAD_ID,
    'per-thread',
  );
  console.log(`session: ${session.id} (thread_id=${DIAGNOSE_THREAD_ID})`);

  const inboxDb = openInboundDb(AGENT_GROUP_ID, session.id);
  try {
    const existing = inboxDb
      .prepare("SELECT id, status, recurrence FROM messages_in WHERE (id = ? OR series_id = ?) AND kind = 'task'")
      .all(TASK_ID, TASK_ID) as Array<{ id: string; status: string; recurrence: string | null }>;
    if (existing.length > 0) {
      console.log(
        `OK:exists count=${existing.length} statuses=${existing.map((r) => r.status).join(',')}`,
      );
      console.log('To replace, cancel first or edit messages_in directly.');
      return;
    }

    insertTask(inboxDb, {
      id: TASK_ID,
      processAfter: nextRunUtc(RECURRENCE),
      recurrence: RECURRENCE,
      platformId: GCHAT_SPACE,
      channelType: 'gchat',
      threadId: DIAGNOSE_THREAD_ID,
      content: JSON.stringify({ prompt }),
    });
    console.log(`OK:inserted id=${TASK_ID} recurrence='${RECURRENCE}' session=${session.id}`);

    // Seed michael-dm destination so Elfi can call send_message at end of
    // diagnose if something is broken. Per-thread sessions don't auto-inherit
    // destinations from the main gchat session.
    const destExists = inboxDb
      .prepare("SELECT 1 FROM destinations WHERE name = 'michael-dm'")
      .get();
    if (!destExists) {
      inboxDb
        .prepare(
          `INSERT INTO destinations (name, display_name, type, channel_type, platform_id, agent_group_id)
           VALUES ('michael-dm', 'Michael (gchat DM)', 'channel', 'gchat', ?, NULL)`,
        )
        .run(GCHAT_SPACE);
      console.log('OK:seeded destination michael-dm');
    }
  } finally {
    inboxDb.close();
    closeDb();
  }
}

main();
