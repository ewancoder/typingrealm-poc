/**
 * Shared protocol types for Rope War.
 * Imported by both the client (browser) and server (Node.js).
 */

// ---------------------------------------------------------------------------
// Client → Server messages
// ---------------------------------------------------------------------------

export type ClientMessage =
    | { type: 'create_room'; playerName: string }
    | { type: 'join_room'; roomId: string; playerName: string; team: 'a' | 'b' }
    | { type: 'switch_team'; team: 'a' | 'b' }
    | { type: 'start_game' }
    | { type: 'correct_keystroke' }
    | { type: 'player_stumbled' }
    | { type: 'text_completed' }
    | { type: 'set_modifier'; team: 'a' | 'b'; modifier: number }
    | { type: 'add_bot'; team: 'a' | 'b'; wpm: number }
    | { type: 'remove_bot'; team: 'a' | 'b' };

// ---------------------------------------------------------------------------
// Server → Client messages
// ---------------------------------------------------------------------------

export type ServerMessage =
    | { type: 'room_created'; roomId: string; playerId: string }
    | { type: 'room_joined'; playerId: string; players: PlayerInfo[] }
    | { type: 'player_joined'; playerName: string; team: 'a' | 'b' }
    | { type: 'player_left'; playerName: string }
    | { type: 'game_started'; text: string }
    | { type: 'rope_update'; position: number }
    | { type: 'next_text'; text: string }
    | { type: 'player_stumbled_broadcast'; playerName: string; team: 'a' | 'b' }
    | { type: 'game_over'; winner: 'a' | 'b'; stats: MatchStats }
    | { type: 'modifier_updated'; team: 'a' | 'b'; modifier: number }
    | { type: 'error'; message: string };

// ---------------------------------------------------------------------------
// Shared data types
// ---------------------------------------------------------------------------

export interface PlayerInfo {
    name: string;
    team: 'a' | 'b';
}

export interface MatchStats {
    duration: number;
    teamAStats: TeamStats;
    teamBStats: TeamStats;
}

export interface TeamStats {
    players: PlayerMatchStats[];
    totalCorrectKeystrokes: number;
    totalErrors: number;
    totalTextsCompleted: number;
}

export interface PlayerMatchStats {
    name: string;
    correctKeystrokes: number;
    errors: number;
    textsCompleted: number;
}
