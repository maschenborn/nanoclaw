#!/usr/bin/env node
/**
 * openclaw-gateway.js
 * Minimal OpenClaw-compatible WebSocket gateway for NanoClaw/Alfred.
 *
 * Paperclip connects here as a client using the openclaw_gateway adapter.
 * When Paperclip sends a wake payload, we dispatch a Paperclip heartbeat
 * to NanoClaw via the `claw` CLI.
 *
 * Protocol: OpenClaw WebSocket Protocol v3
 *   1. Server sends {type:"event", event:"connect.challenge", payload:{nonce, ts}}
 *   2. Client sends {type:"req", id, method:"connect", params:{auth:{token}, ...}}
 *   3. Server responds {type:"res", id, ok:true, payload:{type:"hello-ok", ...}}
 *   4. Client sends {type:"req", id, method:"agent", params:{message, sessionKey, ...}}
 *   5. Server dispatches to NanoClaw via `claw` CLI
 */

'use strict';

const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { readFileSync, writeFileSync, mkdirSync } = require('fs');
const path = require('path');

const SCRIPT_DIR = path.dirname(path.resolve(__filename || process.argv[1]));
const ALFRED_DIR = path.dirname(SCRIPT_DIR);

// Paperclip-style session keys (e.g. "paperclip:issue:UUID") aren't real Claude
// Agent SDK session UUIDs, so we can't pass them straight to `claw -s`. Map them
// once on first dispatch (start a fresh SDK session, capture the UUID claw prints
// to stderr), then resume that mapped UUID on subsequent heartbeats.
const SESSION_MAP_FILE = path.resolve(ALFRED_DIR, '.openclaw/workspace/paperclip-sessions.json');

// Load ws module from alfred's node_modules (same tree as this script)
let WebSocketServer;
try {
  const ws = require(path.resolve(ALFRED_DIR, 'node_modules/ws/index.js'));
  WebSocketServer = ws.WebSocketServer || ws.Server;
} catch (e) {
  // Fallback: try global ws
  try {
    const ws = require('ws');
    WebSocketServer = ws.WebSocketServer || ws.Server;
  } catch (e2) {
    console.error('Failed to load ws module:', e.message, '/', e2.message);
    process.exit(1);
  }
}

// Config
const PORT = parseInt(process.env.OPENCLAW_GATEWAY_PORT || '18789', 10);
const CONFIG_PATHS = [
  (process.env.HOME || '/root') + '/.openclaw/openclaw.json',
  path.resolve(ALFRED_DIR, '.openclaw/openclaw.json'),
];
const CLAW_PATH = path.resolve(SCRIPT_DIR, 'claw');

function loadToken() {
  for (let i = 0; i < CONFIG_PATHS.length; i++) {
    const configPath = CONFIG_PATHS[i];
    try {
      const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
      const token = cfg && cfg.gateway && cfg.gateway.auth && cfg.gateway.auth.token;
      if (token) return token;
    } catch (e) {
      // try next path
    }
  }
  console.error('Failed to load gateway token from any of:', CONFIG_PATHS.join(', '));
  return null;
}

function loadSessionMap() {
  try {
    return JSON.parse(readFileSync(SESSION_MAP_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function rememberSession(externalKey, sdkSessionId) {
  if (!externalKey || !sdkSessionId) return;
  const map = loadSessionMap();
  if (map[externalKey] === sdkSessionId) return;
  map[externalKey] = sdkSessionId;
  try {
    mkdirSync(path.dirname(SESSION_MAP_FILE), { recursive: true });
    writeFileSync(SESSION_MAP_FILE, JSON.stringify(map, null, 2));
    console.log('[gateway] Mapped session: ' + externalKey + ' -> ' + sdkSessionId);
  } catch (e) {
    console.error('[gateway] Failed to persist session map:', e.message);
  }
}

// HTTP server - handles both plain HTTP (HEAD for health/reachability) and WS upgrades
const httpServer = http.createServer(function(req, res) {
  if (req.method === 'HEAD' || req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'X-OpenClaw-Gateway': 'nanoclaw-alfred',
      'X-Protocol-Version': '3',
    });
    if (req.method === 'GET') {
      res.end('OpenClaw Gateway (NanoClaw/Alfred)\n');
    } else {
      res.end();
    }
    return;
  }
  res.writeHead(405);
  res.end('Method Not Allowed');
});

const wss = new WebSocketServer({ server: httpServer });

function genId() {
  return Date.now() + '-' + crypto.randomBytes(4).toString('hex');
}

function send(ws, msg) {
  if (ws.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify(msg));
  }
}

function sendEvent(ws, event, payload) {
  send(ws, { type: 'event', event: event, payload: payload, seq: Date.now() });
}

function sendResponse(ws, id, ok, payload, error) {
  const msg = { type: 'res', id: id, ok: ok };
  if (payload) msg.payload = payload;
  if (error) msg.error = error;
  send(ws, msg);
}

/**
 * Dispatch a Paperclip heartbeat via claw CLI.
 */
function dispatchToClaw(message, externalSessionKey, env) {
  return new Promise(function(resolve, reject) {
    const sessionMap = externalSessionKey ? loadSessionMap() : null;
    const mappedSdkSessionId = sessionMap ? sessionMap[externalSessionKey] : null;

    const args = ['--pipe'];
    if (mappedSdkSessionId) {
      args.push('-s', mappedSdkSessionId);
    }

    const childEnv = Object.assign({}, process.env, env || {});

    console.log('[gateway] Dispatching to claw: external=' + (externalSessionKey || 'none')
      + ' sdkResume=' + (mappedSdkSessionId || 'new'));
    console.log('[gateway] Message preview: ' + String(message).slice(0, 200));

    const child = execFile('python3', [CLAW_PATH].concat(args), {
      env: childEnv,
      timeout: 180000, // 3 min
    });

    child.stdin.write(String(message));
    child.stdin.end();

    let stdout = '';
    let stderr = '';
    if (child.stdout) child.stdout.on('data', function(d) { stdout += d; });
    if (child.stderr) child.stderr.on('data', function(d) { stderr += d; });

    child.on('close', function(code) {
      if (code === 0) {
        // claw prints `[session: <uuid>]` to stderr after a successful run.
        // Capture it so future heartbeats for the same external key resume
        // the same SDK session instead of starting fresh.
        var sessionMatch = stderr.match(/\[session:\s*([^\s\]]+)\]/);
        var newSdkSessionId = sessionMatch ? sessionMatch[1] : null;
        if (externalSessionKey && newSdkSessionId) {
          rememberSession(externalSessionKey, newSdkSessionId);
        }
        resolve({ output: stdout, sessionId: newSdkSessionId });
      } else {
        // Show the LAST 800 chars of stderr — the agent-runner prints its
        // failure cause near the end, not at the start.
        reject(new Error('claw exited with code ' + code + ': ' + stderr.slice(-800)));
      }
    });

    child.on('error', reject);
  });
}

wss.on('connection', function(ws, req) {
  const clientIp = req.socket.remoteAddress;
  console.log('[gateway] Connection from ' + clientIp);

  // Track pending agent runs for agent.wait: reqId -> Promise
  const pendingRuns = new Map();

  // Check if token is already provided as an upgrade header
  const headerToken = req.headers && req.headers['x-openclaw-token'];
  const gatewayToken = loadToken();
  let authenticated = !!(headerToken && gatewayToken && headerToken === gatewayToken);
  if (authenticated) {
    console.log('[gateway] Pre-authenticated via x-openclaw-token header');
  }

  const connId = genId();

  // Step 1: Send challenge
  const nonce = crypto.randomBytes(16).toString('hex');
  sendEvent(ws, 'connect.challenge', { nonce: nonce, ts: Date.now() });

  ws.on('message', function(rawData) {
    let msg;
    try {
      msg = JSON.parse(rawData.toString());
    } catch (e) {
      console.warn('[gateway] Unparseable message from client');
      return;
    }

    // Step 2: Handle connect request
    if (msg.type === 'req' && msg.method === 'connect') {
      const token = loadToken();
      const clientToken = (msg.params && msg.params.auth && msg.params.auth.token) || headerToken;

      if (!token || clientToken !== token) {
        console.warn('[gateway] Auth failed for ' + clientIp + ': token mismatch');
        sendResponse(ws, msg.id, false, null, {
          code: 'auth_failed',
          message: 'Invalid gateway token',
        });
        ws.close();
        return;
      }

      authenticated = true;
      console.log('[gateway] Authenticated connection from ' + clientIp);

      sendResponse(ws, msg.id, true, {
        type: 'hello-ok',
        protocol: 3,
        server: {
          version: '1.0.0-nanoclaw',
          host: 'nanoclaw-alfred',
          connId: connId,
        },
        features: {
          methods: ['connect', 'agent', 'agent.wait', 'health', 'sessions.list'],
          events: ['agent', 'system'],
        },
        policy: {
          maxPayload: 10 * 1024 * 1024,
          maxBufferedBytes: 20 * 1024 * 1024,
          tickIntervalMs: 30000,
        },
      });
      return;
    }

    // All other requests require authentication
    if (!authenticated) {
      sendResponse(ws, msg.id || genId(), false, null, {
        code: 'not_authenticated',
        message: 'Not authenticated',
      });
      return;
    }

    // Health check
    if (msg.type === 'req' && msg.method === 'health') {
      sendResponse(ws, msg.id, true, {
        status: 'ok',
        gateway: 'nanoclaw-alfred',
        ts: Date.now(),
      });
      return;
    }

    // Wake payload - agent request from Paperclip
    if (msg.type === 'req' && msg.method === 'agent') {
      const params = msg.params || {};
      const message = params.message;
      const sessionKey = params.sessionKey;
      const extraSystemPrompt = params.extraSystemPrompt;
      const reqId = msg.id;

      // Emit lifecycle start event
      sendEvent(ws, 'agent', {
        runId: reqId,
        stream: 'lifecycle',
        data: { phase: 'start' },
      });

      // Immediately acknowledge
      sendResponse(ws, reqId, true, { status: 'accepted' });

      // Extract Paperclip env vars from extraSystemPrompt or message
      const env = {};
      const text = String(extraSystemPrompt || message || '');
      const envRegex = /(PAPERCLIP_[A-Z_]+)=([^\s\n]+)/g;
      let m;
      while ((m = envRegex.exec(text)) !== null) {
        env[m[1]] = m[2];
      }

      // Track run for agent.wait
      let waitResolve, waitReject;
      const waitPromise = new Promise(function(resolve, reject) {
        waitResolve = resolve;
        waitReject = reject;
      });
      // Suppress unhandled rejection if agent.wait is never called (Node 22 strict mode)
      waitPromise.catch(function() {});
      pendingRuns.set(reqId, waitPromise);

      dispatchToClaw(message || '', sessionKey, env)
        .then(function(result) {
          // Stream result as agent text
          sendEvent(ws, 'agent', {
            runId: reqId,
            stream: 'assistant',
            data: { text: result.output, delta: result.output },
          });
          // Lifecycle end
          sendEvent(ws, 'agent', {
            runId: reqId,
            stream: 'lifecycle',
            data: { phase: 'end' },
          });
          // Paperclip's openclaw_gateway adapter only accepts 'ok' / 'error' /
          // 'timeout' on agent.wait — anything else (e.g. 'done') trips
          // openclaw_gateway_wait_status_unexpected and the run is marked failed.
          waitResolve({
            status: 'ok',
            exitCode: 0,
            result: { text: result.output },
          });
        })
        .catch(function(err) {
          console.error('[gateway] Dispatch error:', err.message);
          sendEvent(ws, 'agent', {
            runId: reqId,
            stream: 'lifecycle',
            data: { phase: 'error', error: err.message },
          });
          // Resolve (not reject) so Paperclip's agent.wait gets a structured
          // {status:'error', error:'...'} payload instead of an ok:false response,
          // which it interprets via the dedicated 'error' branch.
          waitResolve({
            status: 'error',
            error: err.message,
            exitCode: 1,
          });
        })
        .finally(function() {
          pendingRuns.delete(reqId);
        });

      return;
    }

    // agent.wait - block until the run completes
    if (msg.type === 'req' && msg.method === 'agent.wait') {
      const params = msg.params || {};
      // runId may come as params.runId, params.id, or params.agentRunId
      const runId = params.runId || params.id || params.agentRunId;
      const waitPromise = runId && pendingRuns.get(runId);
      if (waitPromise) {
        waitPromise
          .then(function(result) {
            sendResponse(ws, msg.id, true, result);
          })
          .catch(function(err) {
            sendResponse(ws, msg.id, false, null, {
              code: 'agent_failed',
              message: err.message,
            });
          });
      } else {
        // Run already finished or unknown — return ok immediately so Paperclip
        // doesn't trip openclaw_gateway_wait_status_unexpected.
        sendResponse(ws, msg.id, true, { status: 'ok', exitCode: 0 });
      }
      return;
    }

    // sessions.list stub
    if (msg.type === 'req' && msg.method === 'sessions.list') {
      sendResponse(ws, msg.id, true, { sessions: [] });
      return;
    }

    // Unknown method
    console.warn('[gateway] Unknown method: ' + msg.method);
    sendResponse(ws, msg.id || genId(), false, null, {
      code: 'method_not_found',
      message: 'Method not found: ' + msg.method,
    });
  });

  ws.on('close', function() {
    console.log('[gateway] Connection closed from ' + clientIp);
  });

  ws.on('error', function(err) {
    console.error('[gateway] WS error from ' + clientIp + ':', err.message);
  });
});

httpServer.listen(PORT, '0.0.0.0', function() {
  console.log('[gateway] OpenClaw gateway listening on port ' + PORT);
  console.log('[gateway] HTTP HEAD/GET for health check, WS for protocol');
  const token = loadToken();
  if (!token) {
    console.warn('[gateway] WARNING: No gateway token found at ' + CONFIG_PATH);
  } else {
    console.log('[gateway] Token loaded (' + token.slice(0, 8) + '...)');
  }
});

process.on('SIGTERM', function() {
  console.log('[gateway] Received SIGTERM, shutting down');
  wss.close();
  httpServer.close();
  process.exit(0);
});

process.on('SIGINT', function() {
  console.log('[gateway] Received SIGINT, shutting down');
  wss.close();
  httpServer.close();
  process.exit(0);
});
