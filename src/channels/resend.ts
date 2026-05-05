/**
 * Resend (email) channel adapter (v2) — uses Chat SDK bridge.
 * Self-registers on import.
 */
import { createResendAdapter } from '@resend/chat-sdk-adapter';

import { readEnvFile } from '../env.js';
import { createChatSdkBridge } from './chat-sdk-bridge.js';
import { registerChannelAdapter } from './channel-registry.js';

registerChannelAdapter('resend', {
  factory: () => {
    const env = readEnvFile(['RESEND_API_KEY', 'RESEND_FROM_ADDRESS', 'RESEND_FROM_NAME', 'RESEND_WEBHOOK_SECRET']);
    if (!env.RESEND_API_KEY) return null;
    const resendAdapter = createResendAdapter({
      apiKey: env.RESEND_API_KEY,
      fromAddress: env.RESEND_FROM_ADDRESS,
      fromName: env.RESEND_FROM_NAME,
      webhookSecret: env.RESEND_WEBHOOK_SECRET,
    });
    // supportsThreads MUST be true for Resend: the adapter's ThreadResolver
    // encodes a 3-part `resend:<toAddress>:<rootMessageIdHash>` thread_id.
    // With supportsThreads=false the router (router.ts:165-168) drops the
    // threadId on inbound, the session is created with thread_id=NULL, and
    // outbound delivery falls back to platform_id (2-part), which fails the
    // adapter's decodeThreadId format check. Pair with session_mode=per-thread
    // on the messaging_group_agents row so each email thread gets its own
    // session preserving the proper threadId.
    return createChatSdkBridge({ adapter: resendAdapter, concurrency: 'queue', supportsThreads: true });
  },
});
