/**
 * Lobby screen logic for Rope War.
 */

import type { Connection } from './connection.js';
import type { ServerMessage, PlayerInfo } from '../shared/protocol.js';

interface LobbyState {
    isHost: boolean;
    roomId: string | null;
    players: PlayerInfo[];
    myTeam: 'a' | 'b';
}

const lobbyState: LobbyState = {
    isHost: false,
    roomId: null,
    players: [],
    myTeam: 'a',
};

// DOM elements
const playerNameInput = document.getElementById('player-name') as HTMLInputElement;
const createRoomBtn = document.getElementById('create-room-btn') as HTMLButtonElement;
const roomCodeInput = document.getElementById('room-code-input') as HTMLInputElement;
const joinRoomBtn = document.getElementById('join-room-btn') as HTMLButtonElement;
const roomInfo = document.getElementById('room-info') as HTMLElement;
const roomCodeDisplay = document.getElementById('room-code-display') as HTMLElement;
const teamAList = document.getElementById('team-a-list') as HTMLUListElement;
const teamBList = document.getElementById('team-b-list') as HTMLUListElement;
const joinTeamA = document.getElementById('join-team-a') as HTMLButtonElement;
const joinTeamB = document.getElementById('join-team-b') as HTMLButtonElement;
const startGameBtn = document.getElementById('start-game-btn') as HTMLButtonElement;
const roomActions = document.getElementById('room-actions') as HTMLElement;
const modifierARow = document.getElementById('modifier-a-row') as HTMLElement;
const modifierBRow = document.getElementById('modifier-b-row') as HTMLElement;
const modifierAInput = document.getElementById('modifier-a') as HTMLInputElement;
const modifierBInput = document.getElementById('modifier-b') as HTMLInputElement;
const botARow = document.getElementById('bot-a-row') as HTMLElement;
const botBRow = document.getElementById('bot-b-row') as HTMLElement;
const botAToggle = document.getElementById('bot-a-toggle') as HTMLInputElement;
const botBToggle = document.getElementById('bot-b-toggle') as HTMLInputElement;
const botAWpm = document.getElementById('bot-a-wpm') as HTMLInputElement;
const botBWpm = document.getElementById('bot-b-wpm') as HTMLInputElement;
const languageSelect = document.getElementById('language-select') as HTMLSelectElement;

function getPlayerName(): string {
    return playerNameInput.value.trim() || 'Player';
}

function renderPlayerLists(): void {
    teamAList.innerHTML = '';
    teamBList.innerHTML = '';

    for (const p of lobbyState.players) {
        const li = document.createElement('li');
        li.textContent = p.name;
        if (p.team === 'a') {
            teamAList.appendChild(li);
        } else {
            teamBList.appendChild(li);
        }
    }
}

function showRoomInfo(roomId: string): void {
    lobbyState.roomId = roomId;
    roomCodeDisplay.textContent = roomId;
    roomInfo.classList.remove('hidden');
    roomActions.classList.add('hidden');

    if (lobbyState.isHost) {
        startGameBtn.classList.remove('hidden');
        modifierARow.classList.remove('hidden');
        modifierBRow.classList.remove('hidden');
        botARow.classList.remove('hidden');
        botBRow.classList.remove('hidden');
    }
}

export function handleLobbyMessage(msg: ServerMessage): void {
    switch (msg.type) {
        case 'room_created':
            lobbyState.isHost = true;
            lobbyState.players = [];
            showRoomInfo(msg.roomId);
            break;

        case 'room_joined':
            lobbyState.players = msg.players;
            if (lobbyState.roomId === null) {
                // We just joined via code
                showRoomInfo(roomCodeInput.value.trim().toUpperCase());
            }
            renderPlayerLists();
            break;

        case 'player_joined':
            lobbyState.players.push({ name: msg.playerName, team: msg.team });
            renderPlayerLists();
            break;

        case 'player_left': {
            lobbyState.players = lobbyState.players.filter(
                (p) => p.name !== msg.playerName,
            );
            renderPlayerLists();
            break;
        }

        case 'modifier_updated':
            if (msg.team === 'a') modifierAInput.value = String(msg.modifier);
            else modifierBInput.value = String(msg.modifier);
            break;

        case 'error':
            alert(msg.message);
            break;

        default:
            break;
    }
}

export function initLobby(connection: Connection): void {
    createRoomBtn.addEventListener('click', () => {
        connection.send({
            type: 'create_room',
            playerName: getPlayerName(),
        });
    });

    joinRoomBtn.addEventListener('click', () => {
        const roomId = roomCodeInput.value.trim().toUpperCase();
        if (!roomId) return;
        connection.send({
            type: 'join_room',
            roomId,
            playerName: getPlayerName(),
            team: 'a',
        });
    });

    joinTeamA.addEventListener('click', () => {
        lobbyState.myTeam = 'a';
        connection.send({ type: 'switch_team', team: 'a' });
    });

    joinTeamB.addEventListener('click', () => {
        lobbyState.myTeam = 'b';
        connection.send({ type: 'switch_team', team: 'b' });
    });

    botAToggle.addEventListener('change', () => {
        if (botAToggle.checked) {
            connection.send({ type: 'add_bot', team: 'a', wpm: parseInt(botAWpm.value) || 30 });
        } else {
            connection.send({ type: 'remove_bot', team: 'a' });
        }
    });

    botBToggle.addEventListener('change', () => {
        if (botBToggle.checked) {
            connection.send({ type: 'add_bot', team: 'b', wpm: parseInt(botBWpm.value) || 30 });
        } else {
            connection.send({ type: 'remove_bot', team: 'b' });
        }
    });

    botAWpm.addEventListener('change', () => {
        if (botAToggle.checked) {
            connection.send({ type: 'remove_bot', team: 'a' });
            connection.send({ type: 'add_bot', team: 'a', wpm: parseInt(botAWpm.value) || 30 });
        }
    });

    botBWpm.addEventListener('change', () => {
        if (botBToggle.checked) {
            connection.send({ type: 'remove_bot', team: 'b' });
            connection.send({ type: 'add_bot', team: 'b', wpm: parseInt(botBWpm.value) || 30 });
        }
    });

    modifierAInput.addEventListener('change', () => {
        const val = parseFloat(modifierAInput.value);
        if (val > 0) connection.send({ type: 'set_modifier', team: 'a', modifier: val });
    });

    modifierBInput.addEventListener('change', () => {
        const val = parseFloat(modifierBInput.value);
        if (val > 0) connection.send({ type: 'set_modifier', team: 'b', modifier: val });
    });

    startGameBtn.addEventListener('click', () => {
        connection.send({ type: 'start_game' });
    });
}

export function getMyTeam(): 'a' | 'b' {
    return lobbyState.myTeam;
}

export function getMyName(): string {
    return playerNameInput.value.trim() || 'Player';
}

export function getPlayers(): PlayerInfo[] {
    return lobbyState.players;
}

export function getLanguage(): 'english' | 'kanji' {
    return languageSelect.value as 'english' | 'kanji';
}

export function resetLobby(): void {
    lobbyState.isHost = false;
    lobbyState.roomId = null;
    lobbyState.players = [];
    lobbyState.myTeam = 'a';
    roomInfo.classList.add('hidden');
    roomActions.classList.remove('hidden');
    startGameBtn.classList.add('hidden');
    modifierARow.classList.add('hidden');
    modifierBRow.classList.add('hidden');
    botARow.classList.add('hidden');
    botBRow.classList.add('hidden');
    botAToggle.checked = false;
    botBToggle.checked = false;
    botAWpm.value = '30';
    botBWpm.value = '30';
    modifierAInput.value = '1';
    modifierBInput.value = '1';
    teamAList.innerHTML = '';
    teamBList.innerHTML = '';
}
