/**
 * Rope War — entry point.
 *
 * Wires connection, lobby, game, and stats screens together.
 * Manages screen transitions: lobby -> game -> stats -> lobby.
 */

import { Connection } from './connection.js';
import { initLobby, handleLobbyMessage, resetLobby, getMyName, getPlayers, getLanguage } from './lobby.js';
import { initGame, destroyGame, handleGameMessage, getMatchData } from './game.js';
import { triggerFall, triggerCelebrate } from './sprite-renderer.js';
import { showStats } from './stats-screen.js';
import type { ServerMessage } from '../shared/protocol.js';

type Screen = 'lobby' | 'game' | 'stats' | 'game_over';

const lobbyScreen = document.getElementById('lobby-screen') as HTMLElement;
const gameScreen = document.getElementById('game-screen') as HTMLElement;
const statsScreen = document.getElementById('stats-screen') as HTMLElement;
const playAgainBtn = document.getElementById('play-again-btn') as HTMLButtonElement;
const backToLobbyBtn = document.getElementById('back-to-lobby-btn') as HTMLButtonElement;

let currentScreen: Screen = 'lobby';
const connection = new Connection();

function switchScreen(screen: Screen): void {
    currentScreen = screen;
    lobbyScreen.classList.toggle('hidden', screen !== 'lobby');
    gameScreen.classList.toggle('hidden', screen !== 'game' && screen !== 'game_over');
    statsScreen.classList.toggle('hidden', screen !== 'stats' && screen !== 'game_over');

    // Hide typing area on game over, keep sprites visible
    const typingArea = document.getElementById('typing-area') as HTMLElement;
    typingArea.classList.toggle('hidden', screen === 'game_over');
}

function handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
        case 'game_started':
            switchScreen('game');
            initGame(msg.text, connection, getMyName(), getPlayers(), getLanguage());
            break;

        case 'game_over': {
            const loser = msg.winner === 'a' ? 'b' : 'a';
            triggerFall(loser);
            triggerCelebrate(msg.winner);
            switchScreen('game_over');
            showStats(msg.winner, msg.stats, getMatchData());
            break;
        }

        case 'rope_update':
        case 'next_text':
        case 'player_stumbled_broadcast':
            // These only matter during the game.
            if (currentScreen === 'game') {
                handleGameMessage(msg);
            }
            break;

        case 'room_created':
        case 'room_joined':
        case 'player_joined':
        case 'player_left':
        case 'modifier_updated':
        case 'error':
            // Lobby messages can arrive on any screen (e.g. player_left
            // while waiting), but we only process them in the lobby handler.
            handleLobbyMessage(msg);
            break;

        default:
            break;
    }
}

// Stats screen buttons
playAgainBtn.addEventListener('click', () => {
    destroyGame();
    switchScreen('lobby');
});

backToLobbyBtn.addEventListener('click', () => {
    destroyGame();
    resetLobby();
    switchScreen('lobby');
});

// Boot
async function boot(): Promise<void> {
    const serverInput = document.getElementById('server-address') as HTMLInputElement;
    const address = serverInput.value.trim() || 'batumi.typingrealm.org';

    try {
        await connection.connect(address);
        connection.setMessageHandler(handleMessage);
        initLobby(connection);
    } catch {
        lobbyScreen.innerHTML =
            '<h1>Rope War</h1>' +
            '<p style="text-align:center; color:var(--muted)">Cannot connect to server at ws://' + address + ':34500.<br>Start the server and refresh.</p>';
    }
}

// Connect on button click instead of auto-boot, so user can edit the address.
const connectBtn = document.createElement('button');
connectBtn.textContent = 'Connect';
connectBtn.id = 'connect-btn';
const nameInputArea = document.getElementById('name-input-area') as HTMLElement;
nameInputArea.appendChild(connectBtn);

// Hide room actions until connected.
const roomActionsEl = document.getElementById('room-actions') as HTMLElement;
roomActionsEl.classList.add('hidden');

connectBtn.addEventListener('click', () => {
    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting...';
    boot().then(() => {
        connectBtn.remove();
        roomActionsEl.classList.remove('hidden');
    }).catch(() => {
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect';
    });
});
