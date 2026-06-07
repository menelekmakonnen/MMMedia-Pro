/**
 * MMMedia Pro — Bridge Server Module
 *
 * Call setupBridgeServer(mainWindow) from main.ts after createWindow().
 * Requires: npm install ws
 *
 * Listens on 127.0.0.1:19797 for incoming WebSocket connections from
 * MMMedia Darkroom (or any compatible native client).
 *
 * SECURITY MODEL
 * --------------
 * The bridge can inject media paths, projects, and whole folders into the
 * renderer, so it is treated as a trust boundary:
 *   1. Bound to loopback only (127.0.0.1) — never reachable off-machine.
 *   2. Browser connections are rejected. Legitimate clients are native
 *      processes (CEP/Node) that send no `Origin` header; any request that
 *      DOES carry an Origin is a web page and is refused — unless the origin
 *      is explicitly allowlisted via MMM_BRIDGE_ALLOWED_ORIGINS.
 *   3. Optional shared-secret token. Set MMM_BRIDGE_TOKEN in both apps and
 *      every client must present it in the HANDSHAKE before any data message
 *      is accepted. If the env var is unset, the bridge runs in legacy-open
 *      mode (loopback + origin checks only) and logs a one-time warning.
 */

const { WebSocketServer } = require('ws');

const BRIDGE_PORT = 19797;

// Shared secret (optional). When set, clients must echo it in HANDSHAKE.token.
const BRIDGE_TOKEN = (process.env.MMM_BRIDGE_TOKEN || '').trim();

// Comma-separated origin allowlist for the rare web client. Empty = none allowed.
const ALLOWED_ORIGINS = (process.env.MMM_BRIDGE_ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

function isOriginAllowed(origin) {
    // Native clients send no Origin — always allowed.
    if (!origin) return true;
    return ALLOWED_ORIGINS.includes(origin);
}

function setupBridgeServer(mainWindow) {
    let wss = null;
    const clients = new Set();
    let warnedOpenMode = false;

    try {
        wss = new WebSocketServer({
            host: '127.0.0.1',
            port: BRIDGE_PORT,
            // Reject browser/cross-origin handshakes before the socket opens.
            verifyClient: (info, done) => {
                const origin = info.origin || info.req.headers.origin;
                if (!isOriginAllowed(origin)) {
                    console.warn(`[Bridge] ❌ Rejected connection from disallowed origin: ${origin}`);
                    return done(false, 403, 'Forbidden origin');
                }
                return done(true);
            },
        });
        console.log(`[Bridge] ✅ WebSocket server listening on 127.0.0.1:${BRIDGE_PORT}`);
        if (!BRIDGE_TOKEN) {
            console.warn('[Bridge] ⚠ Running WITHOUT a shared token (legacy-open mode). Set MMM_BRIDGE_TOKEN to require authentication.');
        }

        wss.on('connection', (ws, req) => {
            const clientAddr = req.socket.remoteAddress;
            // A client is authenticated immediately when no token is required;
            // otherwise it must pass the HANDSHAKE token check first.
            ws._authed = !BRIDGE_TOKEN;
            ws._app = 'unknown';
            console.log(`[Bridge] Client connected from ${clientAddr} (auth required: ${!!BRIDGE_TOKEN})`);
            clients.add(ws);

            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('bridge-client-connected', {
                    address: clientAddr,
                    clientCount: clients.size,
                });
            }

            ws.on('message', (raw) => {
                let data;
                try {
                    data = JSON.parse(raw.toString());
                } catch (e) {
                    console.error('[Bridge] Failed to parse message:', e);
                    return;
                }
                handleMessage(ws, data, mainWindow);
            });

            ws.on('close', () => {
                console.log('[Bridge] Client disconnected');
                clients.delete(ws);
                if (mainWindow && mainWindow.webContents) {
                    mainWindow.webContents.send('bridge-client-disconnected', {
                        clientCount: clients.size,
                    });
                }
            });

            ws.on('error', (err) => {
                console.error('[Bridge] Client error:', err.message);
                clients.delete(ws);
            });
        });

        wss.on('error', (err) => {
            console.error('[Bridge] Server error:', err.message);
        });
    } catch (err) {
        console.error('[Bridge] Failed to start bridge server:', err);
    }

    return {
        broadcast: (data) => {
            const msg = JSON.stringify(data);
            clients.forEach((client) => {
                if (client.readyState === 1 && client._authed) {
                    client.send(msg);
                }
            });
        },
        getClientCount: () => clients.size,
        close: () => {
            if (wss) wss.close();
        },
    };
}

function handleMessage(ws, data, mainWindow) {
    const { type } = data;

    // HANDSHAKE is the only message accepted from an unauthenticated client.
    if (type === 'HANDSHAKE') {
        if (BRIDGE_TOKEN && data.token !== BRIDGE_TOKEN) {
            console.warn(`[Bridge] ❌ Handshake rejected — bad/missing token from "${data.app}"`);
            try {
                ws.send(JSON.stringify({ type: 'HANDSHAKE_NACK', reason: 'invalid token' }));
            } catch {}
            ws.close(4001, 'invalid token');
            return;
        }
        ws._authed = true;
        ws._app = data.app || 'unknown';
        console.log(`[Bridge] Handshake OK from: ${data.app} v${data.version}`);
        ws.send(
            JSON.stringify({
                type: 'HANDSHAKE_ACK',
                app: 'MMMedia Pro',
                version: '1.0.0',
                capabilities: ['receive-clips', 'receive-media', 'receive-project'],
            })
        );
        return;
    }

    // Every other message requires an authenticated client.
    if (!ws._authed) {
        console.warn(`[Bridge] ❌ Ignoring "${type}" from unauthenticated client`);
        try {
            ws.send(JSON.stringify({ type: 'ERROR', reason: 'not authenticated — send HANDSHAKE first' }));
        } catch {}
        return;
    }

    switch (type) {
        case 'PING':
            ws.send(JSON.stringify({ type: 'PONG' }));
            break;

        case 'SEND_CLIPS':
            console.log(`[Bridge] Received ${data.clips?.length || 0} clips from ${data.source}`);
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('bridge-receive-clips', data.clips);
            }
            ws.send(JSON.stringify({ type: 'CLIPS_RECEIVED', count: data.clips?.length || 0 }));
            break;

        case 'SEND_MEDIA':
            console.log(`[Bridge] Received ${data.files?.length || 0} media files from ${data.source}`);
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('bridge-receive-media', data.files);
            }
            ws.send(JSON.stringify({ type: 'MEDIA_RECEIVED', count: data.files?.length || 0 }));
            break;

        case 'SEND_PROJECT':
            console.log(`[Bridge] Received full project from ${data.source}`);
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('bridge-receive-project', data.content);
            }
            ws.send(JSON.stringify({ type: 'PROJECT_RECEIVED' }));
            break;

        case 'SEND_FOLDER':
            console.log(`[Bridge] Received folder "${data.folderPath}" with ${data.files?.length || 0} files from ${data.source}`);
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('bridge-receive-folder', {
                    folderPath: data.folderPath,
                    files: data.files || [],
                });
            }
            ws.send(JSON.stringify({ type: 'FOLDER_RECEIVED', count: data.files?.length || 0 }));
            break;

        default:
            console.log(`[Bridge] Unknown message type: ${type}`);
            break;
    }
}

module.exports = setupBridgeServer;
