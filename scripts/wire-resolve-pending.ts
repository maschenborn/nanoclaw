/**
 * One-shot: resolve the two stale resend pending_channel_approvals (Thomas
 * Reusser + Tierarzt Esslingen) by wiring their messaging_groups to Alfred
 * and replaying the queued message into Alfred's session.
 *
 * Background: NanoClaw was restarted today, which cleared the WhatsApp
 * adapter's in-memory pendingQuestions Map. So Michael's `/connect-to-alfred`
 * reply didn't bind to any pending question and got forwarded to Alfred as a
 * normal chat message (Alfred replied "Unknown command"). The DB-side
 * approval state is intact; only the chatJid → questionId mapping is gone.
 *
 * Usage: pnpm exec tsx scripts/wire-resolve-pending.ts
 *
 * Idempotent for already-wired groups (skips, prints "already wired").
 */
import path from 'node:path';

import { DATA_DIR } from '../src/config.js';
import { initDb, closeDb } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations/index.js';
import { getMessagingGroupAgents, createMessagingGroupAgent } from '../src/db/messaging-groups.js';
import { addMember } from '../src/modules/permissions/db/agent-group-members.js';
import { resolveSession, openInboundDb, writeSessionMessage } from '../src/session-manager.js';
import type { InboundEvent } from '../src/channels/adapter.js';

const ALFRED_AG = process.env.TARGET_AGENT_GROUP_ID ?? 'ag-1778000047238-6jof7h';
const v2DbPath = path.join(DATA_DIR, 'v2.db');

function main(): void {
  const db = initDb(v2DbPath);
  runMigrations(db);

  const rows = db
    .prepare(
      `SELECT messaging_group_id, agent_group_id, original_message, approver_user_id
       FROM pending_channel_approvals
       WHERE messaging_group_id LIKE 'mg-%'
       ORDER BY created_at`,
    )
    .all() as Array<{
      messaging_group_id: string;
      agent_group_id: string;
      original_message: string;
      approver_user_id: string;
    }>;

  console.log(`pending rows: ${rows.length}`);

  for (const row of rows) {
    const event: InboundEvent = JSON.parse(row.original_message);
    const recipient = (event.threadId ?? '').split(':')[1] ?? '?';
    const isPhoenix = recipient.toLowerCase() === 'phoenix@aschenborn.dev';
    console.log(
      `\n— ${row.messaging_group_id} (${event.channelType}, recipient=${recipient}${isPhoenix ? ' DMS' : ''})`,
    );

    // 1. wiring (idempotent)
    const existing = getMessagingGroupAgents(row.messaging_group_id);
    if (existing.length === 0) {
      const mgaId = `mga-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      createMessagingGroupAgent({
        id: mgaId,
        messaging_group_id: row.messaging_group_id,
        agent_group_id: ALFRED_AG,
        engage_mode: event.threadId !== null ? 'mention-sticky' : 'pattern',
        engage_pattern: event.threadId !== null ? null : '.',
        sender_scope: 'known',
        ignored_message_policy: 'accumulate',
        session_mode: 'shared',
        priority: 0,
        created_at: new Date().toISOString(),
      });
      console.log(`  wired ↳ ${ALFRED_AG} (mga ${mgaId})`);
    } else {
      console.log(`  already wired (mga ${existing[0].id})`);
    }

    // 2. add sender as member
    const senderId = `${event.channelType}:${event.message?.author?.userId ?? ''}`;
    if (event.message?.author?.userId) {
      try {
        addMember({
          user_id: senderId,
          agent_group_id: ALFRED_AG,
          added_by: row.approver_user_id,
          added_at: new Date().toISOString(),
        });
        console.log(`  + member ${senderId}`);
      } catch (err) {
        console.log(`  member ${senderId} (already / err: ${(err as Error).message.slice(0, 80)})`);
      }
    }

    // 3. write the queued event into Alfred's session's inbound.db so the
    //    running host's session-poll loop picks it up and spawns the agent
    const { session } = resolveSession(
      ALFRED_AG,
      row.messaging_group_id,
      event.threadId,
      event.threadId ? 'per-thread' : 'shared',
    );
    const msgId = event.message?.id ?? `replayed-${row.messaging_group_id}-${Date.now()}`;
    const inbox = openInboundDb(ALFRED_AG, session.id);
    const exists = (() => {
      try {
        return inbox.prepare("SELECT 1 FROM messages_in WHERE id = ?").get(msgId);
      } finally {
        inbox.close();
      }
    })();
    if (exists) {
      console.log(`  message ${msgId} already in session ${session.id} — skip replay`);
    } else {
      writeSessionMessage(ALFRED_AG, session.id, {
        id: msgId,
        kind: 'chat-sdk',
        timestamp: new Date().toISOString(),
        platformId: event.platformId,
        channelType: event.channelType,
        threadId: event.threadId,
        content:
          typeof event.message?.content === 'string'
            ? event.message.content
            : JSON.stringify(event.message?.content ?? ''),
        trigger: 1,
      });
      console.log(`  → replayed into session ${session.id} as ${msgId}`);
    }

    // 4. delete the pending row
    db.prepare("DELETE FROM pending_channel_approvals WHERE messaging_group_id = ?")
      .run(row.messaging_group_id);
    console.log(`  pending_channel_approvals row deleted`);
  }

  closeDb();
  console.log('\nDone. The host\'s session-poll loop should pick up the replayed messages within a few seconds.');
}

main();
