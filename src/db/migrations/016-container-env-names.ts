/**
 * Per-agent env-var forwarding column on `container_configs`.
 *
 * `env_names` holds a JSON array of host env var names. At spawn time
 * `container-runner.ts` calls `readEnvFile(containerConfig.env)` and forwards
 * each found value via `docker -e NAME=value`. Used for agents that need
 * arbitrary host env vars in-container (e.g. Supabase keys for lazi/Elfi,
 * Mautic OAuth creds for timo) that the OneCLI gateway doesn't auto-inject
 * because the calls don't go through it (direct DB connections, OAuth
 * client_credentials flow, etc.).
 *
 * Default '[]' keeps existing agents unchanged. Re-introduces the field
 * that lived in `groups/<folder>/container.json` before container_configs
 * moved to the DB in 014.
 */
import type Database from 'better-sqlite3';

import type { Migration } from './index.js';

export const migration016: Migration = {
  version: 16,
  name: 'container-env-names',
  up(db: Database.Database) {
    db.exec(`ALTER TABLE container_configs ADD COLUMN env_names TEXT NOT NULL DEFAULT '[]'`);
  },
};
