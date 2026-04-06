import type { WebSocket } from 'ws';
import type { ServerMessage, MatchStats, PlayerInfo, TeamStats } from '../../src/shared/protocol.js';
import { getShuffledTextPool } from './texts.js';

export interface PlayerState {
    id: string;
    name: string;
    team: 'a' | 'b';
    ws: WebSocket;
    currentTextIndex: number;
    correctKeystrokes: number;
    errors: number;
    textsCompleted: number;
}

export interface RoomState {
    id: string;
    hostPlayerId: string;
    status: 'waiting' | 'active' | 'finished';
    ropePosition: number;
    pullPerKeystroke: number;
    teamA: PlayerState[];
    teamB: PlayerState[];
    winner: 'a' | 'b' | null;
    textPool: string[];
    textPoolIndex: number;
    startedAt: number | null;
    teamAModifier: number;
    teamBModifier: number;
    botA: { wpm: number } | null;
    botB: { wpm: number } | null;
}

const nullWs = { readyState: 1, OPEN: 1, send() {} } as unknown as WebSocket;
const botIntervals = new Map<string, ReturnType<typeof setInterval>>();

function send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

function broadcastToRoom(room: RoomState, msg: ServerMessage): void {
    for (const p of [...room.teamA, ...room.teamB]) {
        send(p.ws, msg);
    }
}

function findPlayer(room: RoomState, playerId: string): PlayerState | undefined {
    return room.teamA.find(p => p.id === playerId)
        ?? room.teamB.find(p => p.id === playerId);
}

function allPlayers(room: RoomState): PlayerState[] {
    return [...room.teamA, ...room.teamB];
}

function getPlayerList(room: RoomState): PlayerInfo[] {
    return allPlayers(room).map(p => ({ name: p.name, team: p.team }));
}

export function createRoomState(id: string, hostPlayer: PlayerState): RoomState {
    return {
        id,
        hostPlayerId: hostPlayer.id,
        status: 'waiting',
        ropePosition: 0,
        pullPerKeystroke: 1,
        teamA: [hostPlayer],
        teamB: [],
        winner: null,
        textPool: [],
        textPoolIndex: 0,
        startedAt: null,
        teamAModifier: 1,
        teamBModifier: 1,
        botA: null,
        botB: null,
    };
}

export function addPlayer(room: RoomState, player: PlayerState): void {
    if (player.team === 'a') {
        room.teamA.push(player);
    } else {
        room.teamB.push(player);
    }

    // Notify existing players
    broadcastToRoom(room, {
        type: 'player_joined',
        playerName: player.name,
        team: player.team,
    });

    // Send room state to the new player
    send(player.ws, {
        type: 'room_joined',
        playerId: player.id,
        players: getPlayerList(room),
    });
}

export function removePlayer(room: RoomState, playerId: string): string | null {
    const player = findPlayer(room, playerId);
    if (!player) return null;

    const name = player.name;
    room.teamA = room.teamA.filter(p => p.id !== playerId);
    room.teamB = room.teamB.filter(p => p.id !== playerId);

    broadcastToRoom(room, { type: 'player_left', playerName: name });

    // If host left, assign new host
    if (room.hostPlayerId === playerId) {
        const remaining = allPlayers(room);
        if (remaining.length > 0) {
            room.hostPlayerId = remaining[0].id;
        }
    }

    return name;
}

export function switchTeam(room: RoomState, playerId: string, newTeam: 'a' | 'b'): void {
    const player = findPlayer(room, playerId);
    if (!player) return;
    if (player.team === newTeam) return;

    // Remove from current team
    room.teamA = room.teamA.filter(p => p.id !== playerId);
    room.teamB = room.teamB.filter(p => p.id !== playerId);

    // Add to new team
    player.team = newTeam;
    if (newTeam === 'a') {
        room.teamA.push(player);
    } else {
        room.teamB.push(player);
    }

    // Broadcast updated player list to all clients by sending
    // player_left + player_joined so everyone rebuilds their lists.
    broadcastToRoom(room, { type: 'player_left', playerName: player.name });
    broadcastToRoom(room, { type: 'player_joined', playerName: player.name, team: newTeam });
}

export function startGame(room: RoomState): boolean {
    if (room.status === 'active') return false;
    if (room.teamA.length === 0 || room.teamB.length === 0) return false;

    room.textPool = getShuffledTextPool();
    room.textPoolIndex = 0;
    room.status = 'active';
    room.ropePosition = 0;
    room.winner = null;
    room.startedAt = Date.now();

    // Assign first text to each player and notify
    for (const player of allPlayers(room)) {
        player.currentTextIndex = room.textPoolIndex;
        player.correctKeystrokes = 0;
        player.errors = 0;
        player.textsCompleted = 0;
        room.textPoolIndex++;
    }

    // Broadcast game_started with the first text (each player gets their own text via next_text if needed)
    // For simplicity, send the same first text to everyone via game_started,
    // then immediately send individual next_text for players with different assignments.
    // Actually, each player should get their own text. Let's send game_started with their assigned text.
    for (const player of allPlayers(room)) {
        const text = room.textPool[player.currentTextIndex % room.textPool.length];
        send(player.ws, { type: 'game_started', text });
    }

    startBotTyping(room);

    return true;
}

export function handleCorrectKeystroke(room: RoomState, playerId: string): void {
    if (room.status !== 'active') return;

    const player = findPlayer(room, playerId);
    if (!player) return;

    player.correctKeystrokes++;

    // Team A pulls left (negative), Team B pulls right (positive)
    const direction = player.team === 'a' ? -1 : 1;
    const modifier = player.team === 'a' ? room.teamAModifier : room.teamBModifier;
    room.ropePosition += direction * room.pullPerKeystroke * modifier;
    room.ropePosition = Math.max(-100, Math.min(100, room.ropePosition));

    broadcastToRoom(room, { type: 'rope_update', position: room.ropePosition });

    checkWinCondition(room);
}

export function handleStumble(room: RoomState, playerId: string): void {
    if (room.status !== 'active') return;

    const player = findPlayer(room, playerId);
    if (!player) return;

    player.errors++;

    broadcastToRoom(room, {
        type: 'player_stumbled_broadcast',
        playerName: player.name,
        team: player.team,
    });
}

export function handleTextCompleted(room: RoomState, playerId: string): void {
    if (room.status !== 'active') return;

    const player = findPlayer(room, playerId);
    if (!player) return;

    player.textsCompleted++;

    // Assign next text from pool (wrap around)
    room.textPoolIndex++;
    const nextIndex = room.textPoolIndex % room.textPool.length;
    player.currentTextIndex = nextIndex;

    const text = room.textPool[nextIndex];
    send(player.ws, { type: 'next_text', text });
}

function checkWinCondition(room: RoomState): void {
    if (room.ropePosition <= -100) {
        finishGame(room, 'a');
    } else if (room.ropePosition >= 100) {
        finishGame(room, 'b');
    }
}

function finishGame(room: RoomState, winner: 'a' | 'b'): void {
    room.status = 'finished';
    room.winner = winner;
    stopBotTyping(room);

    const stats = buildMatchStats(room);
    broadcastToRoom(room, { type: 'game_over', winner, stats });
}

function buildTeamStats(players: PlayerState[]): TeamStats {
    return {
        players: players.map(p => ({
            name: p.name,
            correctKeystrokes: p.correctKeystrokes,
            errors: p.errors,
            textsCompleted: p.textsCompleted,
        })),
        totalCorrectKeystrokes: players.reduce((sum, p) => sum + p.correctKeystrokes, 0),
        totalErrors: players.reduce((sum, p) => sum + p.errors, 0),
        totalTextsCompleted: players.reduce((sum, p) => sum + p.textsCompleted, 0),
    };
}

function buildMatchStats(room: RoomState): MatchStats {
    const duration = room.startedAt ? (Date.now() - room.startedAt) / 1000 : 0;
    return {
        duration,
        teamAStats: buildTeamStats(room.teamA),
        teamBStats: buildTeamStats(room.teamB),
    };
}

export function setModifier(room: RoomState, team: 'a' | 'b', modifier: number): void {
    if (team === 'a') {
        room.teamAModifier = modifier;
    } else {
        room.teamBModifier = modifier;
    }
    broadcastToRoom(room, { type: 'modifier_updated', team, modifier });
}

export function addBot(room: RoomState, team: 'a' | 'b', wpm: number): void {
    const botId = `bot-${team}`;
    const existing = findPlayer(room, botId);
    if (existing) return; // already has a bot

    if (team === 'a') room.botA = { wpm };
    else room.botB = { wpm };

    const bot: PlayerState = {
        id: botId,
        name: team === 'a' ? 'Bot-A' : 'Bot-B',
        team,
        ws: nullWs,
        currentTextIndex: 0,
        correctKeystrokes: 0,
        errors: 0,
        textsCompleted: 0,
    };
    addPlayer(room, bot);
}

export function removeBot(room: RoomState, team: 'a' | 'b'): void {
    const botId = `bot-${team}`;
    if (team === 'a') room.botA = null;
    else room.botB = null;

    const name = removePlayer(room, botId);
    if (name) {
        // removePlayer already broadcasts player_left
    }
}

function startBotTyping(room: RoomState): void {
    for (const team of ['a', 'b'] as const) {
        const botConfig = team === 'a' ? room.botA : room.botB;
        if (!botConfig) continue;

        const botId = `bot-${team}`;
        const intervalMs = 60000 / (botConfig.wpm * 5);

        const interval = setInterval(() => {
            if (room.status !== 'active') {
                clearInterval(interval);
                botIntervals.delete(botId);
                return;
            }
            handleCorrectKeystroke(room, botId);
        }, intervalMs);

        botIntervals.set(botId, interval);
    }
}

function stopBotTyping(room: RoomState): void {
    for (const team of ['a', 'b']) {
        const botId = `bot-${team}`;
        const interval = botIntervals.get(botId);
        if (interval) {
            clearInterval(interval);
            botIntervals.delete(botId);
        }
    }
}

export function isRoomEmpty(room: RoomState): boolean {
    return room.teamA.length === 0 && room.teamB.length === 0;
}
