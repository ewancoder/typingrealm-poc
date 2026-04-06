import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../../src/shared/protocol.js';
import {
    createRoom,
    joinRoom,
    removePlayer,
    getRoomForPlayer,
} from './room-manager.js';
import {
    startGame,
    handleCorrectKeystroke,
    handleStumble,
    handleTextCompleted,
    switchTeam,
    setModifier,
    addBot,
    removeBot,
} from './room.js';

const PORT = 34500;

const httpServer = createServer((req, res) => {
    // CORS headers for Vite dev server
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Rope War WebSocket Server');
});

const wss = new WebSocketServer({ server: httpServer });

function send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

wss.on('connection', (ws: WebSocket) => {
    const playerId = randomUUID();
    console.log(`Client connected: ${playerId}`);

    ws.on('message', (data: Buffer | string) => {
        let msg: ClientMessage;
        try {
            msg = JSON.parse(typeof data === 'string' ? data : data.toString()) as ClientMessage;
        } catch {
            send(ws, { type: 'error', message: 'Invalid JSON' });
            return;
        }

        handleMessage(playerId, ws, msg);
    });

    ws.on('close', () => {
        console.log(`Client disconnected: ${playerId}`);
        removePlayer(playerId);
    });

    ws.on('error', (err: Error) => {
        console.error(`WebSocket error for ${playerId}:`, err.message);
    });
});

function handleMessage(playerId: string, ws: WebSocket, msg: ClientMessage): void {
    switch (msg.type) {
        case 'create_room': {
            createRoom(msg.playerName, playerId, ws);
            break;
        }

        case 'join_room': {
            joinRoom(msg.roomId.toUpperCase(), msg.playerName, msg.team, playerId, ws);
            break;
        }

        case 'switch_team': {
            const room = getRoomForPlayer(playerId);
            if (!room) {
                send(ws, { type: 'error', message: 'Not in a room' });
                break;
            }
            switchTeam(room, playerId, msg.team);
            break;
        }

        case 'start_game': {
            const room = getRoomForPlayer(playerId);
            if (!room) {
                send(ws, { type: 'error', message: 'Not in a room' });
                break;
            }
            if (room.hostPlayerId !== playerId) {
                send(ws, { type: 'error', message: 'Only the host can start the game' });
                break;
            }
            if (!startGame(room)) {
                send(ws, { type: 'error', message: 'Cannot start game — need at least one player per team' });
            }
            break;
        }

        case 'correct_keystroke': {
            const room = getRoomForPlayer(playerId);
            if (!room) break;
            handleCorrectKeystroke(room, playerId);
            break;
        }

        case 'player_stumbled': {
            const room = getRoomForPlayer(playerId);
            if (!room) break;
            handleStumble(room, playerId);
            break;
        }

        case 'text_completed': {
            const room = getRoomForPlayer(playerId);
            if (!room) break;
            handleTextCompleted(room, playerId);
            break;
        }

        case 'add_bot': {
            const room = getRoomForPlayer(playerId);
            if (!room) { send(ws, { type: 'error', message: 'Not in a room' }); break; }
            if (room.hostPlayerId !== playerId) { send(ws, { type: 'error', message: 'Only the host can add bots' }); break; }
            addBot(room, msg.team, msg.wpm);
            break;
        }

        case 'remove_bot': {
            const room = getRoomForPlayer(playerId);
            if (!room) { send(ws, { type: 'error', message: 'Not in a room' }); break; }
            if (room.hostPlayerId !== playerId) { send(ws, { type: 'error', message: 'Only the host can remove bots' }); break; }
            removeBot(room, msg.team);
            break;
        }

        case 'set_modifier': {
            const room = getRoomForPlayer(playerId);
            if (!room) {
                send(ws, { type: 'error', message: 'Not in a room' });
                break;
            }
            if (room.hostPlayerId !== playerId) {
                send(ws, { type: 'error', message: 'Only the host can set modifiers' });
                break;
            }
            setModifier(room, msg.team, msg.modifier);
            break;
        }

        default: {
            send(ws, { type: 'error', message: `Unknown message type: ${(msg as { type: string }).type}` });
        }
    }
}

httpServer.listen(PORT, () => {
    console.log(`Rope War server listening on ws://localhost:${PORT}`);
});
