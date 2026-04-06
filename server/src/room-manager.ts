import type { WebSocket } from 'ws';
import type { ServerMessage } from '../../src/shared/protocol.js';
import {
    type RoomState,
    type PlayerState,
    createRoomState,
    addPlayer,
    removePlayer as removePlayerFromRoom,
    isRoomEmpty,
} from './room.js';

const rooms = new Map<string, RoomState>();
const playerToRoom = new Map<string, string>();

function generateRoomId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let id: string;
    do {
        id = '';
        for (let i = 0; i < 4; i++) {
            id += chars[Math.floor(Math.random() * chars.length)];
        }
    } while (rooms.has(id));
    return id;
}

function send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

export function createRoom(playerName: string, playerId: string, ws: WebSocket): RoomState {
    const roomId = generateRoomId();

    const player: PlayerState = {
        id: playerId,
        name: playerName,
        team: 'a',
        ws,
        currentTextIndex: 0,
        correctKeystrokes: 0,
        errors: 0,
        textsCompleted: 0,
    };

    const room = createRoomState(roomId, player);
    rooms.set(roomId, room);
    playerToRoom.set(playerId, roomId);

    send(ws, { type: 'room_created', roomId, playerId });
    // Also send room_joined so the client populates the player list with the host.
    send(ws, { type: 'room_joined', playerId, players: [{ name: playerName, team: 'a' }] });
    console.log(`Room ${roomId} created by "${playerName}" (${playerId})`);

    return room;
}

export function joinRoom(
    roomId: string,
    playerName: string,
    team: 'a' | 'b',
    playerId: string,
    ws: WebSocket,
): boolean {
    const room = rooms.get(roomId);
    if (!room) {
        send(ws, { type: 'error', message: `Room ${roomId} not found` });
        return false;
    }

    if (room.status !== 'waiting') {
        send(ws, { type: 'error', message: 'Game already in progress' });
        return false;
    }

    const player: PlayerState = {
        id: playerId,
        name: playerName,
        team,
        ws,
        currentTextIndex: 0,
        correctKeystrokes: 0,
        errors: 0,
        textsCompleted: 0,
    };

    addPlayer(room, player);
    playerToRoom.set(playerId, roomId);

    console.log(`"${playerName}" (${playerId}) joined room ${roomId} on team ${team}`);
    return true;
}

export function removePlayer(playerId: string): void {
    const roomId = playerToRoom.get(playerId);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) {
        playerToRoom.delete(playerId);
        return;
    }

    const name = removePlayerFromRoom(room, playerId);
    playerToRoom.delete(playerId);

    if (name) {
        console.log(`"${name}" (${playerId}) left room ${roomId}`);
    }

    if (isRoomEmpty(room)) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted (empty)`);
    }
}

export function getRoom(roomId: string): RoomState | null {
    return rooms.get(roomId) ?? null;
}

export function getRoomForPlayer(playerId: string): RoomState | null {
    const roomId = playerToRoom.get(playerId);
    if (!roomId) return null;
    return rooms.get(roomId) ?? null;
}
