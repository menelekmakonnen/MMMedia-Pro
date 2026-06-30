/**
 * enderClient.cjs — sends a render job to MMMedia Ender.
 *
 * Tries the live WebSocket bridge first (ws://127.0.0.1:19898) for instant
 * handoff; falls back to the durable file mailbox (~/MMMedia/Ender/inbox) if
 * Ender isn't running. The `job` is the SAME { clips, settings } payload Pro
 * builds for export, plus optional encode `overrides`.
 */
const path = require('path');
const os = require('os');
const fs = require('fs');

const ENDER_WS = 'ws://127.0.0.1:19898';
const MAILBOX_INBOX = path.join(os.homedir(), 'MMMedia', 'Ender', 'inbox');
const TOKEN = (process.env.MMM_BRIDGE_TOKEN || '').trim();

function writeToMailbox(job) {
  fs.mkdirSync(MAILBOX_INBOX, { recursive: true });
  const safe = String(job.name || 'render').replace(/[^a-z0-9_\- ]/gi, '_').slice(0, 60);
  const file = path.join(MAILBOX_INBOX, `${Date.now()}_${safe}.enderjob.json`);
  fs.writeFileSync(file, JSON.stringify(job, null, 2), 'utf8');
  return { ok: true, transport: 'mailbox', file };
}

function sendToEnder(job, { timeoutMs = 2500 } = {}) {
  return new Promise((resolve) => {
    let WebSocket;
    try {
      WebSocket = require('ws');
    } catch {
      return resolve(writeToMailbox(job));
    }

    let settled = false;
    const finish = (r) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      resolve(r);
    };

    let ws;
    try {
      ws = new WebSocket(ENDER_WS);
    } catch {
      return resolve(writeToMailbox(job));
    }
    const timer = setTimeout(() => finish(writeToMailbox(job)), timeoutMs);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'HANDSHAKE',
        app: job.source || 'MMMedia Pro',
        version: '1.0.0',
        token: TOKEN || undefined,
        capabilities: ['send-render-job'],
      }));
    });

    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      if (m.type === 'HANDSHAKE_ACK') {
        ws.send(JSON.stringify({ type: 'SEND_RENDER_JOB', job }));
      } else if (m.type === 'JOB_QUEUED') {
        clearTimeout(timer);
        finish({ ok: true, transport: 'bridge', id: m.id });
      } else if (m.type === 'HANDSHAKE_NACK' || m.type === 'JOB_ERROR') {
        clearTimeout(timer);
        finish(writeToMailbox(job));
      }
    });

    ws.on('error', () => { clearTimeout(timer); finish(writeToMailbox(job)); });
  });
}

module.exports = { sendToEnder, writeToMailbox };
