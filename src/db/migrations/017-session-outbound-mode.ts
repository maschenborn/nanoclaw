/**
 * Per-session outbound channel projection control.
 *
 * Channel destinations (from `agent_destinations`) are projected into each
 * session's `inbound.db` on every container spawn so the running agent can
 * resolve names locally. The projection is keyed on `agent_group_id`, which
 * means every session of an agent — including scheduled-task-only ones with
 * no human counterpart on the channel — inherits the same destinations.
 *
 * Some sessions are autonomous: they exist only to run a recurring task and
 * write to disk. They have no business with channel destinations, and giving
 * them any creates a foot-gun where the agent calls `send_message` and reaches
 * the channel anyway, bypassing whatever later task is supposed to deliver
 * the result.
 *
 * `outbound_mode='channel'` (default) keeps the existing projection.
 * `outbound_mode='none'` makes `writeDestinations` project an empty list, so
 * `send_message` fails with "No destinations configured" — the desired
 * outcome for autonomous sessions.
 */
import type Database from 'better-sqlite3';

import type { Migration } from './index.js';

export const migration017: Migration = {
  version: 17,
  name: 'session-outbound-mode',
  up(db: Database.Database) {
    db.exec(`ALTER TABLE sessions ADD COLUMN outbound_mode TEXT NOT NULL DEFAULT 'channel'`);
  },
};
