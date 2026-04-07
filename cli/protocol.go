package main

// serverMsg is a flat struct that covers all server→client message types.
// Only the fields relevant to each message type are populated.
type serverMsg struct {
	Type       string       `json:"type"`
	RoomID     string       `json:"roomId,omitempty"`
	PlayerID   string       `json:"playerId,omitempty"`
	PlayerName string       `json:"playerName,omitempty"`
	Players    []playerInfo `json:"players,omitempty"`
	Text       string       `json:"text,omitempty"`
	Position   float64      `json:"position,omitempty"`
	Team       string       `json:"team,omitempty"`
	Winner     string       `json:"winner,omitempty"`
	Stats      *matchStats  `json:"stats,omitempty"`
	Modifier   float64      `json:"modifier,omitempty"`
	Message    string       `json:"message,omitempty"`
}

type playerInfo struct {
	Name string `json:"name"`
	Team string `json:"team"`
}

type matchStats struct {
	Duration   float64   `json:"duration"`
	TeamAStats teamStats `json:"teamAStats"`
	TeamBStats teamStats `json:"teamBStats"`
}

type teamStats struct {
	Players                []playerMatchStats `json:"players"`
	TotalCorrectKeystrokes int                `json:"totalCorrectKeystrokes"`
	TotalErrors            int                `json:"totalErrors"`
	TotalTextsCompleted    int                `json:"totalTextsCompleted"`
}

type playerMatchStats struct {
	Name              string `json:"name"`
	CorrectKeystrokes int    `json:"correctKeystrokes"`
	Errors            int    `json:"errors"`
	TextsCompleted    int    `json:"textsCompleted"`
}
