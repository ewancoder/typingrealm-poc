package main

import (
	"fmt"
	"math"
	"os"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

const (
	screenConnect = iota
	screenMenu
	screenLobby
	screenGame
	screenStats
)

const stunDuration = 5 * time.Second

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

var (
	titleStyle  = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("205"))
	teamAColor  = lipgloss.Color("14") // cyan
	teamBColor  = lipgloss.Color("11") // yellow
	teamAStyle  = lipgloss.NewStyle().Foreground(teamAColor).Bold(true)
	teamBStyle  = lipgloss.NewStyle().Foreground(teamBColor).Bold(true)
	typedStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("10")) // green
	cursorStyle = lipgloss.NewStyle().Reverse(true)
	dimStyle    = lipgloss.NewStyle().Foreground(lipgloss.Color("8"))
	errorStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("9")).Bold(true)
	stunBanner  = lipgloss.NewStyle().Foreground(lipgloss.Color("9")).Bold(true).Background(lipgloss.Color("0"))
	helpStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("8"))
	winStyle  = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("10"))
	loseStyle   = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("9"))
	headerStyle = lipgloss.NewStyle().Bold(true).Underline(true)
)

// ---------------------------------------------------------------------------
// Custom tea.Msg types
// ---------------------------------------------------------------------------

type disconnectedMsg struct{}
type stunEndMsg struct{}
type gameTickMsg time.Time
type connectResultMsg struct {
	conn *connection
	err  error
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

type model struct {
	screen int
	width  int
	height int

	// connect
	serverInput textinput.Model
	nameInput   textinput.Model
	focusIdx    int // 0=server, 1=name
	connecting  bool

	// menu
	roomInput  textinput.Model
	joinMode   bool // true when room code input is focused
	menuStatus string

	// connection
	conn *connection

	// lobby + identity
	roomID  string
	isHost  bool
	myName  string
	myTeam  string
	myID    string
	players []playerInfo
	modA    float64
	modB    float64
	hasBotA bool
	hasBotB bool

	// game
	text       string
	runes      []rune // text as runes for indexing
	cursor     int
	stunned    bool
	stunEnd    time.Time
	ropePos    float64
	logs       []string
	textsCount int

	// stats
	winner string
	stats  *matchStats

	// errors
	errMsg string
}

func initialModel() model {
	si := textinput.New()
	si.Placeholder = "localhost"
	si.SetValue("batumi.typingrealm.org")
	si.Focus()
	si.Width = 30

	ni := textinput.New()
	ni.Placeholder = "Your name"
	ni.CharLimit = 20
	ni.Width = 30

	ri := textinput.New()
	ri.Placeholder = "ABCD"
	ri.CharLimit = 10
	ri.Width = 10

	return model{
		screen:      screenConnect,
		serverInput: si,
		nameInput:   ni,
		roomInput:   ri,
		modA:        1.0,
		modB:        1.0,
		myTeam:      "a",
	}
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

func (m model) Init() tea.Cmd {
	return textinput.Blink
}

// ---------------------------------------------------------------------------
// WebSocket listener command
// ---------------------------------------------------------------------------

func waitForWs(ch <-chan serverMsg) tea.Cmd {
	return func() tea.Msg {
		msg, ok := <-ch
		if !ok {
			return disconnectedMsg{}
		}
		return msg
	}
}

func gameTick() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg {
		return gameTickMsg(t)
	})
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil

	case tea.KeyMsg:
		// Ctrl+C always quits
		if msg.Type == tea.KeyCtrlC {
			if m.conn != nil {
				m.conn.close()
			}
			return m, tea.Quit
		}

	case disconnectedMsg:
		m.conn = nil
		m.errMsg = "Disconnected from server"
		m.screen = screenConnect
		return m, nil

	case connectResultMsg:
		m.connecting = false
		if msg.err != nil {
			m.errMsg = fmt.Sprintf("Connection failed: %v", msg.err)
			return m, nil
		}
		m.conn = msg.conn
		m.screen = screenMenu
		m.errMsg = ""
		m.menuStatus = ""
		m.joinMode = false
		return m, waitForWs(m.conn.msgCh)

	case stunEndMsg:
		m.stunned = false
		return m, nil

	case gameTickMsg:
		if m.screen == screenGame {
			return m, gameTick()
		}
		return m, nil

	case serverMsg:
		return m.handleServerMsg(msg)
	}

	// Dispatch to per-screen update
	switch m.screen {
	case screenConnect:
		return m.updateConnect(msg)
	case screenMenu:
		return m.updateMenu(msg)
	case screenLobby:
		return m.updateLobby(msg)
	case screenGame:
		return m.updateGame(msg)
	case screenStats:
		return m.updateStats(msg)
	}
	return m, nil
}

// --- Server message handler ---

func (m model) handleServerMsg(msg serverMsg) (tea.Model, tea.Cmd) {
	cmds := []tea.Cmd{waitForWs(m.conn.msgCh)}

	switch msg.Type {
	case "room_created":
		m.roomID = msg.RoomID
		m.myID = msg.PlayerID
		m.isHost = true
		m.screen = screenLobby
		m.errMsg = ""

	case "room_joined":
		m.myID = msg.PlayerID
		m.players = msg.Players
		m.screen = screenLobby
		m.errMsg = ""

	case "player_joined":
		m.players = append(m.players, playerInfo{Name: msg.PlayerName, Team: msg.Team})

	case "player_left":
		filtered := m.players[:0]
		for _, p := range m.players {
			if p.Name != msg.PlayerName {
				filtered = append(filtered, p)
			}
		}
		m.players = filtered

	case "modifier_updated":
		if msg.Team == "a" {
			m.modA = msg.Modifier
		} else {
			m.modB = msg.Modifier
		}

	case "game_started":
		m.screen = screenGame
		m.text = msg.Text
		m.runes = []rune(msg.Text)
		m.cursor = 0
		m.stunned = false
		m.ropePos = 0
		m.logs = nil
		m.textsCount = 0
		m.errMsg = ""
		m.addLog("Game started! Type!")
		cmds = append(cmds, gameTick())

	case "rope_update":
		m.ropePos = msg.Position

	case "next_text":
		m.text = msg.Text
		m.runes = []rune(msg.Text)
		m.cursor = 0
		m.textsCount++
		m.addLog(fmt.Sprintf("Text #%d completed! Next text.", m.textsCount))

	case "player_stumbled_broadcast":
		team := "A"
		if msg.Team == "b" {
			team = "B"
		}
		m.addLog(fmt.Sprintf("%s (Team %s) stumbled!", msg.PlayerName, team))

	case "game_over":
		m.screen = screenStats
		m.winner = msg.Winner
		m.stats = msg.Stats

	case "error":
		m.errMsg = msg.Message
		if m.screen == screenMenu {
			m.menuStatus = "Error: " + msg.Message
		}
	}

	return m, tea.Batch(cmds...)
}

// --- Per-screen update ---

func (m model) updateConnect(msg tea.Msg) (tea.Model, tea.Cmd) {
	keyMsg, ok := msg.(tea.KeyMsg)
	if !ok {
		// Forward to focused input
		return m.updateConnectInputs(msg)
	}

	switch keyMsg.Type {
	case tea.KeyTab, tea.KeyShiftTab:
		m.focusIdx = (m.focusIdx + 1) % 2
		if m.focusIdx == 0 {
			m.serverInput.Focus()
			m.nameInput.Blur()
		} else {
			m.serverInput.Blur()
			m.nameInput.Focus()
		}
		return m, nil

	case tea.KeyEnter:
		addr := strings.TrimSpace(m.serverInput.Value())
		name := strings.TrimSpace(m.nameInput.Value())
		if addr == "" {
			m.errMsg = "Server address required"
			return m, nil
		}
		if name == "" {
			m.errMsg = "Name required"
			return m, nil
		}
		m.myName = name
		m.errMsg = ""
		m.connecting = true

		return m, func() tea.Msg {
			conn, err := dial(addr)
			if err != nil {
				return connectResultMsg{conn: nil, err: err}
			}
			return connectResultMsg{conn: conn, err: nil}
		}
	}

	return m.updateConnectInputs(msg)
}

func (m model) updateConnectInputs(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd
	var cmd tea.Cmd
	m.serverInput, cmd = m.serverInput.Update(msg)
	cmds = append(cmds, cmd)
	m.nameInput, cmd = m.nameInput.Update(msg)
	cmds = append(cmds, cmd)
	return m, tea.Batch(cmds...)
}

func (m model) updateMenu(msg tea.Msg) (tea.Model, tea.Cmd) {
	keyMsg, ok := msg.(tea.KeyMsg)
	if !ok {
		if m.joinMode {
			var cmd tea.Cmd
			m.roomInput, cmd = m.roomInput.Update(msg)
			return m, cmd
		}
		return m, nil
	}

	if m.joinMode {
		switch keyMsg.Type {
		case tea.KeyEnter:
			code := strings.TrimSpace(m.roomInput.Value())
			if code == "" {
				return m, nil
			}
			m.conn.send(map[string]any{
				"type":       "join_room",
				"roomId":     strings.ToUpper(code),
				"playerName": m.myName,
				"team":       "a",
			})
			m.myTeam = "a"
			m.menuStatus = "Joining room..."
			m.joinMode = false
			m.roomInput.Blur()
			return m, nil

		case tea.KeyEsc:
			m.joinMode = false
			m.roomInput.Blur()
			return m, nil
		}

		var cmd tea.Cmd
		m.roomInput, cmd = m.roomInput.Update(msg)
		return m, cmd
	}

	switch keyMsg.String() {
	case "c":
		m.conn.send(map[string]any{
			"type":       "create_room",
			"playerName": m.myName,
		})
		m.menuStatus = "Creating room..."

	case "j":
		m.joinMode = true
		m.roomInput.SetValue("")
		m.roomInput.Focus()

	case "q":
		m.conn.close()
		m.conn = nil
		m.screen = screenConnect
		m.errMsg = ""
	}
	return m, nil
}

func (m model) updateLobby(msg tea.Msg) (tea.Model, tea.Cmd) {
	keyMsg, ok := msg.(tea.KeyMsg)
	if !ok {
		return m, nil
	}

	switch keyMsg.String() {
	case "a":
		m.conn.send(map[string]any{"type": "switch_team", "team": "a"})
		m.myTeam = "a"
	case "b":
		m.conn.send(map[string]any{"type": "switch_team", "team": "b"})
		m.myTeam = "b"
	case "s":
		if m.isHost {
			m.conn.send(map[string]any{"type": "start_game"})
		}
	case "q":
		m.conn.close()
		m.conn = nil
		m.screen = screenConnect
		m.resetLobby()
	case "1":
		if m.isHost {
			if m.hasBotA {
				m.conn.send(map[string]any{"type": "remove_bot", "team": "a"})
				m.hasBotA = false
			} else {
				m.conn.send(map[string]any{"type": "add_bot", "team": "a", "wpm": 30})
				m.hasBotA = true
			}
		}
	case "2":
		if m.isHost {
			if m.hasBotB {
				m.conn.send(map[string]any{"type": "remove_bot", "team": "b"})
				m.hasBotB = false
			} else {
				m.conn.send(map[string]any{"type": "add_bot", "team": "b", "wpm": 30})
				m.hasBotB = true
			}
		}
	case "-":
		if m.isHost && m.modA > 0.2 {
			m.modA = math.Round((m.modA-0.1)*10) / 10
			m.conn.send(map[string]any{"type": "set_modifier", "team": "a", "modifier": m.modA})
		}
	case "=", "+":
		if m.isHost {
			m.modA = math.Round((m.modA+0.1)*10) / 10
			m.conn.send(map[string]any{"type": "set_modifier", "team": "a", "modifier": m.modA})
		}
	case "[":
		if m.isHost && m.modB > 0.2 {
			m.modB = math.Round((m.modB-0.1)*10) / 10
			m.conn.send(map[string]any{"type": "set_modifier", "team": "b", "modifier": m.modB})
		}
	case "]":
		if m.isHost {
			m.modB = math.Round((m.modB+0.1)*10) / 10
			m.conn.send(map[string]any{"type": "set_modifier", "team": "b", "modifier": m.modB})
		}
	}
	return m, nil
}

func (m model) updateGame(msg tea.Msg) (tea.Model, tea.Cmd) {
	keyMsg, ok := msg.(tea.KeyMsg)
	if !ok {
		return m, nil
	}

	if m.stunned {
		return m, nil
	}

	switch keyMsg.Type {
	case tea.KeyBackspace:
		if m.cursor > 0 {
			m.cursor--
		}
		return m, nil

	case tea.KeyRunes:
		if len(keyMsg.Runes) != 1 || m.cursor >= len(m.runes) {
			return m, nil
		}
		typed := keyMsg.Runes[0]
		expected := m.runes[m.cursor]
		if typed == expected {
			m.cursor++
			m.conn.send(map[string]any{"type": "correct_keystroke"})
			if m.cursor >= len(m.runes) {
				m.conn.send(map[string]any{"type": "text_completed"})
			}
		} else {
			m.stunned = true
			m.stunEnd = time.Now().Add(stunDuration)
			m.conn.send(map[string]any{"type": "player_stumbled"})
			m.addLog("You stumbled! Stunned 5s")
			return m, tea.Tick(stunDuration, func(t time.Time) tea.Msg { return stunEndMsg{} })
		}

	case tea.KeySpace:
		if m.cursor >= len(m.runes) {
			return m, nil
		}
		if m.runes[m.cursor] == ' ' {
			m.cursor++
			m.conn.send(map[string]any{"type": "correct_keystroke"})
			if m.cursor >= len(m.runes) {
				m.conn.send(map[string]any{"type": "text_completed"})
			}
		} else {
			m.stunned = true
			m.stunEnd = time.Now().Add(stunDuration)
			m.conn.send(map[string]any{"type": "player_stumbled"})
			m.addLog("You stumbled! Stunned 5s")
			return m, tea.Tick(stunDuration, func(t time.Time) tea.Msg { return stunEndMsg{} })
		}
	}
	return m, nil
}

func (m model) updateStats(msg tea.Msg) (tea.Model, tea.Cmd) {
	keyMsg, ok := msg.(tea.KeyMsg)
	if !ok {
		return m, nil
	}
	switch keyMsg.String() {
	case "r":
		m.screen = screenLobby
		m.resetGame()
	case "q":
		if m.conn != nil {
			m.conn.close()
			m.conn = nil
		}
		m.screen = screenConnect
		m.resetLobby()
		m.resetGame()
	}
	return m, nil
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

func (m model) View() string {
	switch m.screen {
	case screenConnect:
		return m.viewConnect()
	case screenMenu:
		return m.viewMenu()
	case screenLobby:
		return m.viewLobby()
	case screenGame:
		return m.viewGame()
	case screenStats:
		return m.viewStats()
	}
	return ""
}

func (m model) viewConnect() string {
	var b strings.Builder

	b.WriteString("\n")
	b.WriteString(titleStyle.Render("  ═══ ROPE WAR ═══"))
	b.WriteString("\n")
	b.WriteString(dimStyle.Render("  CLI Edition"))
	b.WriteString("\n\n")

	b.WriteString("  Server: ")
	b.WriteString(m.serverInput.View())
	b.WriteString("\n")
	b.WriteString("  Name:   ")
	b.WriteString(m.nameInput.View())
	b.WriteString("\n\n")

	if m.connecting {
		b.WriteString("  Connecting...\n")
	} else {
		b.WriteString(helpStyle.Render("  [Enter] Connect  [Tab] Switch field  [Ctrl+C] Quit"))
		b.WriteString("\n")
	}

	if m.errMsg != "" {
		b.WriteString("\n")
		b.WriteString(errorStyle.Render("  " + m.errMsg))
		b.WriteString("\n")
	}

	return b.String()
}

func (m model) viewMenu() string {
	var b strings.Builder

	b.WriteString("\n")
	b.WriteString(titleStyle.Render("  ═══ ROPE WAR ═══"))
	b.WriteString("\n")
	b.WriteString(fmt.Sprintf("  Connected as %s\n\n", m.myName))

	if m.joinMode {
		b.WriteString("  Enter room code: ")
		b.WriteString(m.roomInput.View())
		b.WriteString("\n\n")
		b.WriteString(helpStyle.Render("  [Enter] Join  [Esc] Cancel"))
		b.WriteString("\n")
	} else {
		b.WriteString(helpStyle.Render("  [c] Create Room  [j] Join Room  [q] Disconnect"))
		b.WriteString("\n")
	}

	if m.menuStatus != "" {
		b.WriteString("\n  " + m.menuStatus + "\n")
	}
	if m.errMsg != "" {
		b.WriteString("\n")
		b.WriteString(errorStyle.Render("  " + m.errMsg))
		b.WriteString("\n")
	}

	return b.String()
}

func (m model) viewLobby() string {
	var b strings.Builder

	b.WriteString("\n")
	b.WriteString(titleStyle.Render(fmt.Sprintf("  ═══ Room: %s ═══", m.roomID)))
	b.WriteString("\n\n")

	// Separate players by team
	var teamA, teamB []string
	for _, p := range m.players {
		label := p.Name
		if p.Name == m.myName {
			label += " (you)"
		}
		if p.Team == "a" {
			teamA = append(teamA, label)
		} else {
			teamB = append(teamB, label)
		}
	}

	// Render team columns
	maxRows := len(teamA)
	if len(teamB) > maxRows {
		maxRows = len(teamB)
	}
	if maxRows < 3 {
		maxRows = 3
	}

	colW := 24

	// Team A header
	aHeader := teamAStyle.Render(fmt.Sprintf("  %-*s", colW, "Team A"))
	bHeader := teamBStyle.Render(fmt.Sprintf("%-*s", colW, "Team B"))
	b.WriteString(aHeader + "  " + bHeader + "\n")

	aSep := teamAStyle.Render(fmt.Sprintf("  %-*s", colW, strings.Repeat("─", colW)))
	bSep := teamBStyle.Render(fmt.Sprintf("%-*s", colW, strings.Repeat("─", colW)))
	b.WriteString(aSep + "  " + bSep + "\n")

	for i := 0; i < maxRows; i++ {
		aLine := ""
		if i < len(teamA) {
			aLine = "  • " + teamA[i]
		}
		bLine := ""
		if i < len(teamB) {
			bLine = "• " + teamB[i]
		}
		b.WriteString(fmt.Sprintf("  %-*s  %-*s\n", colW, aLine, colW, bLine))
	}

	b.WriteString(fmt.Sprintf("\n  Modifier A: %.1fx    Modifier B: %.1fx\n", m.modA, m.modB))
	b.WriteString("\n")

	// Help
	myTeamLabel := "A"
	if m.myTeam == "b" {
		myTeamLabel = "B"
	}
	b.WriteString(helpStyle.Render(fmt.Sprintf("  You are on Team %s", myTeamLabel)))
	b.WriteString("\n")
	b.WriteString(helpStyle.Render("  [a/b] Switch Team  [q] Leave"))
	b.WriteString("\n")
	if m.isHost {
		b.WriteString(helpStyle.Render("  [s] Start Game  [1/2] Toggle Bot A/B"))
		b.WriteString("\n")
		b.WriteString(helpStyle.Render("  [-/=] Mod A  [\\[/\\]] Mod B"))
		b.WriteString("\n")
	}

	if m.errMsg != "" {
		b.WriteString("\n")
		b.WriteString(errorStyle.Render("  " + m.errMsg))
		b.WriteString("\n")
	}

	return b.String()
}

func (m model) viewGame() string {
	var b strings.Builder

	b.WriteString("\n")

	// Rope
	ropeWidth := m.width - 20
	if ropeWidth < 20 {
		ropeWidth = 20
	}
	if ropeWidth > 60 {
		ropeWidth = 60
	}

	aLabel := teamAStyle.Render("Team A")
	bLabel := teamBStyle.Render("Team B")
	rope := renderRope(m.ropePos, ropeWidth)
	b.WriteString(fmt.Sprintf("  %s  %s  %s\n", aLabel, rope, bLabel))

	// Position indicator
	posStr := fmt.Sprintf("[%.0f]", m.ropePos)
	padLen := 10 + ropeWidth/2 - len(posStr)/2
	if padLen < 0 {
		padLen = 0
	}
	b.WriteString(strings.Repeat(" ", padLen) + dimStyle.Render(posStr) + "\n\n")

	// Typing area
	b.WriteString("  " + strings.Repeat("─", min(m.width-4, 70)) + "\n")
	b.WriteString("  " + renderTypingText(m.runes, m.cursor, m.stunned) + "\n")
	b.WriteString("  " + strings.Repeat("─", min(m.width-4, 70)) + "\n")

	// Stun indicator
	if m.stunned {
		remaining := time.Until(m.stunEnd).Seconds()
		if remaining < 0 {
			remaining = 0
		}
		b.WriteString("\n")
		b.WriteString(stunBanner.Render(fmt.Sprintf("  *** STUNNED! (%.0fs remaining) ***", remaining)))
		b.WriteString("\n")
	}

	// Log
	b.WriteString("\n")
	b.WriteString(dimStyle.Render("  ── Log ──") + "\n")
	for _, l := range m.logs {
		b.WriteString(dimStyle.Render("  "+l) + "\n")
	}

	// Progress
	b.WriteString("\n")
	b.WriteString(dimStyle.Render(fmt.Sprintf("  Texts completed: %d  |  Progress: %d/%d", m.textsCount, m.cursor, len(m.runes))))
	b.WriteString("\n")

	return b.String()
}

func (m model) viewStats() string {
	var b strings.Builder

	b.WriteString("\n")
	b.WriteString(titleStyle.Render("  ═══ GAME OVER ═══"))
	b.WriteString("\n\n")

	// Winner
	if m.winner == "a" {
		b.WriteString("  " + winStyle.Render("Team A Wins!") + "\n")
	} else {
		b.WriteString("  " + winStyle.Render("Team B Wins!") + "\n")
	}

	if m.stats != nil {
		b.WriteString(fmt.Sprintf("\n  Duration: %.1fs\n", m.stats.Duration))

		b.WriteString("\n")
		b.WriteString(renderTeamStats("Team A", m.stats.TeamAStats, m.winner == "a"))
		b.WriteString("\n")
		b.WriteString(renderTeamStats("Team B", m.stats.TeamBStats, m.winner == "b"))
	}

	b.WriteString("\n")
	b.WriteString(helpStyle.Render("  [r] Play Again  [q] Quit"))
	b.WriteString("\n")

	return b.String()
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

func renderRope(pos float64, width int) string {
	if width < 3 {
		width = 3
	}
	trackW := width - 2 // exclude ◄ ►

	idx := int(math.Round((pos + 100) / 200 * float64(trackW-1)))
	if idx < 0 {
		idx = 0
	}
	if idx >= trackW {
		idx = trackW - 1
	}

	var sb strings.Builder
	sb.WriteString("◄")
	for i := 0; i < trackW; i++ {
		if i == idx {
			sb.WriteString(lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("15")).Render("●"))
		} else {
			sb.WriteString(dimStyle.Render("═"))
		}
	}
	sb.WriteString("►")
	return sb.String()
}

func renderTypingText(runes []rune, cursor int, stunned bool) string {
	var sb strings.Builder
	for i, ch := range runes {
		s := string(ch)
		switch {
		case i < cursor:
			sb.WriteString(typedStyle.Render(s))
		case i == cursor:
			if stunned {
				sb.WriteString(errorStyle.Render(s))
			} else {
				sb.WriteString(cursorStyle.Render(s))
			}
		default:
			sb.WriteString(dimStyle.Render(s))
		}
	}
	return sb.String()
}

func renderTeamStats(name string, ts teamStats, won bool) string {
	var b strings.Builder

	style := loseStyle
	if won {
		style = winStyle
	}
	b.WriteString("  " + style.Render(name) + "\n")
	b.WriteString("  " + strings.Repeat("─", 50) + "\n")

	b.WriteString(fmt.Sprintf("  %-16s %8s %8s %8s\n",
		headerStyle.Render("Player"),
		headerStyle.Render("Keys"),
		headerStyle.Render("Errors"),
		headerStyle.Render("Texts")))

	for _, p := range ts.Players {
		b.WriteString(fmt.Sprintf("  %-16s %8d %8d %8d\n", p.Name, p.CorrectKeystrokes, p.Errors, p.TextsCompleted))
	}

	b.WriteString(fmt.Sprintf("  %-16s %8d %8d %8d\n",
		lipgloss.NewStyle().Bold(true).Render("Total"),
		ts.TotalCorrectKeystrokes, ts.TotalErrors, ts.TotalTextsCompleted))

	return b.String()
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

func (m *model) addLog(msg string) {
	m.logs = append(m.logs, msg)
	if len(m.logs) > 8 {
		m.logs = m.logs[len(m.logs)-8:]
	}
}

func (m *model) resetLobby() {
	m.roomID = ""
	m.isHost = false
	m.myID = ""
	m.players = nil
	m.modA = 1.0
	m.modB = 1.0
	m.hasBotA = false
	m.hasBotB = false
	m.errMsg = ""
}

func (m *model) resetGame() {
	m.text = ""
	m.runes = nil
	m.cursor = 0
	m.stunned = false
	m.ropePos = 0
	m.logs = nil
	m.textsCount = 0
	m.winner = ""
	m.stats = nil
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

func main() {
	p := tea.NewProgram(initialModel(), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}
}
