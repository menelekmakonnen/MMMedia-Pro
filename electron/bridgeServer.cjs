/**
 * MMMedia Pro — Bridge Server Module
 * 
 * Drop this file into MMMedia Pro's electron/ directory.
 * Call setupBridgeServer(mainWindow) from main.ts after createWindow().
 * 
 * Requires: npm install ws
 * 
 * Listens on port 19797 for incoming WebSocket connections from
 * MMMedia Darkroom (or any compatible client).
 */

const { WebSocketServer } = require('ws');

const BRIDGE_PORT = 19797;

function setupBridgeServer(mainWindow) {
    let wss = null;
    const clients = new Set();

    try {
        wss = new WebSocketServer({ port: BRIDGE_PORT });
        console.log(`[Bridge] ✅ WebSocket server listening on port ${BRIDGE_PORT}`);

        wss.on('connection', (ws, req) => {
            const clientAddr = req.socket.remoteAddress;
            console.log(`[Bridge] Client connected from ${clientAddr}`);
            clients.add(ws);

            // Notify renderer
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('bridge-client-connected', {
                    address: clientAddr,
                    clientCount: clients.size
                });
            }

            ws.on('message', (raw) => {
                try {
                    const data = JSON.parse(raw.toString());
                    handleMessage(ws, data, mainWindow);
                } catch (e) {
                    console.error('[Bridge] Failed to parse message:', e);
                }
            });

            ws.on('close', () => {
                console.log('[Bridge] Client disconnected');
                clients.delete(ws);
                if (mainWindow && mainWindow.webContents) {
                    mainWindow.webContents.send('bridge-client-disconnected', {
                        clientCount: clients.size
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
            clients.forEach(client => {
                if (client.readyState === 1) { // WebSocket.OPEN
                    client.send(msg);
                }
            });
        },
        getClientCount: () => clients.size,
        close: () => {
            if (wss) wss.close();
        }
    };
}

function handleMessage(ws, data, mainWindow) {
    const { type } = data;

    switch (type) {
        case 'HANDSHAKE':
            console.log(`[Bridge] Handshake from: ${data.app} v${data.version}`);
            ws.send(JSON.stringify({
                type: 'HANDSHAKE_ACK',
                app: 'MMMedia Pro',
                version: '1.0.0',
                capabilities: ['receive-clips', 'receive-media', 'receive-project']
            }));
            break;

        case 'PING':
            ws.send(JSON.stringify({ type: 'PONG' }));
            break;

        case 'SEND_CLIPS':
            console.log(`[Bridge] Received ${data.clips?.length || 0} clips from ${data.source}`);
            // Forward to renderer for store hydration
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('bridge-receive-clips', data.clips);
            }
            ws.send(JSON.stringify({
                type: 'CLIPS_RECEIVED',
                count: data.clips?.length || 0
            }));
            break;

        case 'SEND_MEDIA':
            console.log(`[Bridge] Received ${data.files?.length || 0} media files from ${data.source}`);
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('bridge-receive-media', data.files);
            }
            ws.send(JSON.stringify({
                type: 'MEDIA_RECEIVED',
                count: data.files?.length || 0
            }));
            break;

        case 'SEND_PROJECT':
            console.log(`[Bridge] Received full project from ${data.source}`);
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('bridge-receive-project', data.content);
            }
            ws.send(JSON.stringify({
                type: 'PROJECT_RECEIVED'
            }));
            break;

        case 'SEND_FOLDER':
            console.log(`[Bridge] Received folder "${data.folderPath}" with ${data.files?.length || 0} files from ${data.source}`);
            if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('bridge-receive-folder', {
                    folderPath: data.folderPath,
                    files: data.files || []
                });
            }
            ws.send(JSON.stringify({
                type: 'FOLDER_RECEIVED',
                count: data.files?.length || 0
            }));
            break;

        default:
            console.log(`[Bridge] Unknown message type: ${type}`);
            break;
    }
}

module.exports = setupBridgeServer;
