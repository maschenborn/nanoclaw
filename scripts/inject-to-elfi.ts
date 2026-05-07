/**
 * Inject a message into Elfi's gchat session inbound.db. Claude-from-host →
 * Elfi-the-agent direct messaging while we don't have proper agent-to-agent
 * channels. Elfi processes via the normal poll loop; her response goes out via
 * her wired gchat channel (Michael sees it in Google Chat).
 *
 * Usage: TARGET_AGENT_GROUP_ID=... pnpm exec tsx scripts/inject-to-elfi.ts "<text>"
 */
import path from 'node:path';
import { DATA_DIR } from '../src/config.js';
import { initDb, closeDb } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations/index.js';
import { resolveSession, writeSessionMessage } from '../src/session-manager.js';

const ELFI_AG = process.env.TARGET_AGENT_GROUP_ID ?? 'ag-1778163532245-qw4nmf';
const text = process.argv[2];
if (!text) { console.error('usage: ... "<text>"'); process.exit(1); }

initDb(path.join(DATA_DIR, 'v2.db'));
runMigrations(initDb(path.join(DATA_DIR, 'v2.db')) as any);

const db = initDb(path.join(DATA_DIR, 'v2.db'));
const mg = db.prepare(
  "SELECT mg.id AS id, mg.channel_type AS channel_type, mg.platform_id AS platform_id FROM messaging_groups mg JOIN messaging_group_agents mga ON mga.messaging_group_id=mg.id WHERE mga.agent_group_id=? AND mg.channel_type='gchat' LIMIT 1"
).get(ELFI_AG) as { id: string; channel_type: string; platform_id: string } | undefined;
if (!mg) { console.error('no gchat messaging group wired to Elfi'); process.exit(1); }

const threadId = `${mg.platform_id}:dm`;
const { session } = resolveSession(ELFI_AG, mg.id, threadId, 'per-thread');

// Construct chat-sdk-shaped message that Elfi's bridge will serialize as if
// it came from "Claude (NanoClaw host)". Author userId is synthetic.
const msg = {
  _type: 'chat:Message',
  id: `host-claude-${Date.now()}`,
  threadId,
  text,
  author: {
    userId: 'host:claude',
    userName: 'Claude (NanoClaw host)',
    fullName: 'Claude',
    isBot: false,
    isMe: false,
  },
  metadata: { dateSent: new Date().toISOString(), edited: false },
  attachments: [],
  isMention: true,
  senderId: 'host:claude',
  sender: 'Claude (NanoClaw host)',
  senderName: 'Claude',
  isGroup: false,
};

writeSessionMessage(ELFI_AG, session.id, {
  id: msg.id,
  kind: 'chat-sdk',
  timestamp: new Date().toISOString(),
  platformId: mg.platform_id,
  channelType: 'gchat',
  threadId,
  content: JSON.stringify(msg),
  trigger: 1,
});
console.log(`injected as ${msg.id} into ${session.id}`);
closeDb();
