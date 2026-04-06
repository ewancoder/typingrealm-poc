# TypingRealm — Typing Engine POC

## Vision

TypingRealm is a keyboard-typing-first project. Long-term goal: an RPG where every action (combat, crafting, movement, dialogue) is driven by typing, with precision valued over raw speed, and multiplayer support. Before the game, we build a training suite (weak-spot detection, targeted drills) that later becomes the in-game "training grounds."

Core pillar: **deep analytics**. Every keystroke, release, and pause is captured with sub-millisecond precision and mined for weak bigrams, frequent mistypes, and timing patterns.

### Multilingual / CJK

The engine MUST support CJK input from day one. For Chinese/Japanese the user types latin characters (pinyin/romaji) that resolve into native glyphs. A single glyph may have multiple valid romanizations. The engine handles input resolution itself — no OS IME. Analytics are two-layered: raw keystroke performance, plus input-to-glyph resolution.

---

## Settled Architecture Decisions

- **Backend**: .NET (C#). JIT for the main game server (rich domain), AOT for small satellite services. Some satellites may later be written in Go (WebSocket relay, matchmaking, metrics).
- **Frontend**: Angular long-term. **POC is framework-free** — pure HTML/CSS/TS.
- **Database**: PostgreSQL.
- **Typing engine**: TypeScript. Layer 0 (keystroke capture) MAY be pure JS but TS under our disciplined subset compiles to byte-identical JS, so TS is free.
- **TS subset rules**: interfaces, type aliases, const assertions, type annotations only. NO `enum`, `namespace`, decorators (they emit runtime code). `strict: true`. No `any` — use `unknown` + narrowing.
- **Event sourcing**: not adopted broadly. Typing sessions are *naturally* event-sourced (we capture the full event log). Game state uses standard state + audit log. Introduce event sourcing surgically if/when a bounded context demands it.
- **Monolith first**: modular monolith with clear internal boundaries so extraction is cheap but not premature.
- **Offline-first PWA**: the app works fully without a server. IndexedDB is the primary client store. Even once a backend exists, the client always writes locally first and syncs asynchronously — the app never blocks on network.

---

## Offline-First / Storage Architecture

The app is a PWA that must load and run with zero connectivity. No backend is required for MVP or solo play. When a server is added later, it becomes a replication target; IndexedDB remains the source of truth.

### StorageProvider abstraction

All persistence flows through a single `StorageProvider` interface. App code never touches IndexedDB / localStorage / fetch directly for data. Start the interface **minimal** — don't add query/filter methods until a real need appears.

```typescript
interface StorageProvider {
  saveSession(session: TypingSessionResult): Promise<void>;
  getSessions(): Promise<TypingSessionResult[]>;
  getSessionById(id: string): Promise<TypingSessionResult | null>;
  saveUserProfile(profile: UserProfile): Promise<void>;
  getUserProfile(): Promise<UserProfile | null>;
}
```

Implementations:

| Implementation | When | Notes |
|---|---|---|
| `IndexedDbStorageProvider` | MVP — build first | Local-only, offline, fast |
| `ApiStorageProvider` | When server exists | Talks to .NET REST API |
| `SyncingStorageProvider` | When server exists | Wraps IndexedDB locally, syncs to server in background. IndexedDB stays source of truth. |
| `CloudFileStorageProvider` | Far future, maybe | User's own cloud (Drive/iCloud) for cross-device without our server. Do NOT let this influence current design. |

The app picks one provider at startup; swapping is a config change, not a rewrite.

### Data design rules (sync-ready from day one)

Even though MVP is offline-only, structure every record so sync is additive later:

1. **Client-generated IDs**: every record gets a `crypto.randomUUID()` at creation. Never rely on server auto-increment.
2. **Timestamps on everything**: `createdAt` and `updatedAt` as ISO strings, set client-side.
3. **Reserve space for sync metadata** (do NOT implement yet, but don't design against it): `syncStatus: 'local' | 'synced' | 'pending'`, `syncedAt`, `deviceId`. These will be added via IndexedDB migration (fields with defaults) when sync ships.

`TypingSessionResult` carries: `id`, `createdAt`, `text` (`string | GlyphText[]`), `startedAt`/`finishedAt` (ISO), `timezone`, `timezoneOffset`, `events` (raw log — source of truth), `analytics` (derived, recomputable from events at any time).

### PWA requirements

- **Service worker**: caches the app shell (HTML/CSS/JS) for full offline. Update strategy: stale-while-revalidate — check in background, apply on next load.
- **Manifest**: installable on mobile and desktop, standalone display mode. Icons/theme colors TBD.
- **IndexedDB schema (MVP)**: keep flat, don't normalize.
  ```
  sessions     keyPath: "id",  indexes: ["createdAt"]
  userProfile  keyPath: "id"   (single record, id = "default")
  ```
  A session record contains its own analytics. The profile holds preferences + aggregate stats.

### Engine integration

Layers 0–3 are unchanged and know nothing about persistence. The wiring is:

```
[Keystroke Capture] → [State Machine] → [Renderer]
                                      → [Session Recorder] → [StorageProvider] → IndexedDB
```

Flow: session finishes → Layer 3 produces `TypingSessionResult` → `storageProvider.saveSession(result)`. The storage layer is a **peer** of the engine, not a part of it.

### Offline scope — what NOT to build yet

- No server, API, or database
- No sync logic — only the interface that enables it later
- No cloud storage integration
- No push notifications, no Background Sync API
- No multi-device conflict resolution

Build the IndexedDB provider, make the app installable, ship. Everything else is a future `StorageProvider`.

---

## Dual Input Mode Architecture

The engine supports **two input modes** for non-latin scripts (Japanese kanji, Chinese). These are fundamentally different interaction models — do NOT merge them.

### Mode A — Guided Romanization (existing)

App shows target glyph + expected romaji. User types latin keys against a known sequence. Full per-keystroke analytics (bigram timings, dwell time, etc.). Server-verifiable. Used for: finger mechanics training, competitive typing, multiplayer, game combat.

### Mode B — IME Composition (future, do NOT build yet)

App shows target glyph only. User composes via OS IME however they want. Engine captures composition lifecycle (`compositionstart`/`compositionend`), not individual keystrokes. Analytics are per-composition (composition time, accuracy per character). NOT server-verifiable — training/practice only, never competitive.

**Why Mode B exists**: Mapping all kanji to all valid romanized readings is intractable. Real Japanese/Chinese typing uses IME with candidate selection. Mode B trains language competence; Mode A trains finger mechanics.

### Key constraints

- Layer 0: Mode B adds `compositionstart`/`compositionend` listeners; ignores `keydown`/`keyup` where `isComposing === true`. Mode A suppresses/warns if IME is active.
- Layer 1: New `processComposition(state, compositionResult)` — simpler than guided (compare committed text to target, advance cursor, no backspace).
- Layer 2: Mode B needs a text input element for IME input, not just global key capture.
- Layer 3: `TypingSessionResult` gains `inputMode: 'guided' | 'composition'` with separate event arrays.
- Do NOT intercept individual keystrokes during IME composition.
- Do NOT use Mode B for competitive multiplayer or game combat (trivially cheatable).
- Every language that supports composition mode MUST also support guided romanization.

---

## Typing Engine — Four Layers

```
Layer 0: Keystroke Capture (tiny, hot path)
   ↓ { key, perf, action }
Layer 1: Typing State Machine (pure logic, no DOM)
   ↓ TypingEvent[]
Layer 2: Renderer (DOM / Canvas / WebGL — swappable)
Layer 3: Session Recorder (raw log + derived analytics)
```

### Layer 0 — Keystroke Capture (`src/layer0/keystroke-capture.ts`)

- Attaches `keydown`/`keyup`. The FIRST statement in each handler is `performance.now()` — timestamp capture is sacred.
- Normalizes keys: single printables are case-sensitive as-is; `Shift` → `LShift`/`RShift` via `event.location`; `Backspace` → `"Backspace"`; other named keys pass through; unsupported keys return `null` and are dropped.
- Calls the callback synchronously. Layer 1 runs in the same microtask — timestamp is already captured, so downstream work doesn't skew measurement.
- No state, no rendering, no decisions.

### Layer 1 — State Machine (`src/layer1/`)

Pure, immutable, portable. Must be reimplementable in C# for server-side multiplayer validation.

**Core signature:** `processKeystroke(state, input) → { state, events }`. Input state is NEVER mutated.

Key types (see `types.ts`):
- `TypeableUnit` — `{ expected, originalExpected, modified, currentlyFailed, everFailed, completed, glyphGroupId, errorSource }`.
- `TypingState` — `{ sequence, glyphGroups, cursor, active, paused, pausedAt, pauseRecords, startedAt, finishedAt }`.
- `TypingEvent` — tagged union: `started`, `cursor_moved`, `char_correct`, `char_incorrect`, `char_corrected`, `backspace`, `finished`, `glyph_progress`, `glyph_completed`.
- `PauseRecord` — `{ pausedAt, resumedAt }` (performance.now() timestamps).

Behavior:
1. `release` actions are ignored by the machine (Layer 3 still logs them for dwell time).
2. Modifiers (Shift, Ctrl, Alt, Meta, CapsLock, Tab, Esc) are no-ops.
3. First valid keystroke sets `startedAt` and emits `started`.
4. `Backspace`: if `cursor > 0`, step back one, clear that unit's `currentlyFailed`/`completed`, emit `backspace` + `cursor_moved` (+ `glyph_progress` if applicable).
5. Printable char: compare to `sequence[cursor].expected`. Match → mark completed, emit `char_correct` (or `char_corrected` if `everFailed` was already true). Mismatch → set `currentlyFailed` + `everFailed`, emit `char_incorrect`.
6. **Last-char rule (fixes old deadlock)**: on the last index, a WRONG press does NOT advance the cursor. User must retype. Finish only fires when the last char is correct AND no `currentlyFailed` units remain.

### Layer 2 — Renderer (`src/layer2/dom-renderer.ts`)

DOM renderer for POC. Creates a `<span class="ch">` per unit; for CJK wraps groups in `<span class="glyph">` with a `glyph-native` header and a `glyph-romaji` row of unit spans. Purely reactive: subscribes to `TypingEvent`s and applies CSS classes (`cursor`, `typed`, `wrong`, `corrected`, `glyph-active`, `glyph-done`, `finished`). It NEVER reads or writes state.

Swapping this layer for Canvas/WebGL later must not require changes to Layers 0/1/3.

### Layer 3 — Session Recorder (`src/layer3/session-recorder.ts`)

Accumulates every raw keystroke (press AND release). On request, derives analytics from the raw log plus the final sequence snapshot:

- `wpm` — clean chars / 5 / minutes (only never-failed, completed units count).
- `rawWpm` — all printable presses / 5 / minutes.
- `accuracy` — 1 − (everFailed / total).
- `bigramTimings` — press-to-press of consecutive correct chars, averaged per bigram, sorted slowest first. Wrong presses break the chain.
- `bigramErrors` — per-transition error rate, sorted worst first.

Rebuild is deterministic: given the same events + final sequence, analytics are reproducible (client-side for instant feedback, server-side for trust).

`TypingSessionResult` packages: source text, ISO timestamps, timezone, raw events, analytics.

### TextProvider (`src/text-providers/`)

Bridges "source content" and "typeable sequence". Interface: `generateSequence(source) → { sequence, glyphGroups }`.

- `latinTextProvider`: input `string`. Normalizes whitespace, produces one unit per char, no glyph groups.
- `cjkTextProvider`: input `GlyphText[]` (`{ glyph, romanized }[]`). One unit per romanized char, each glyph becomes a `GlyphGroup` with `unitIndices`. Future: multiple valid romanizations per glyph.

Latin is NOT the default and CJK is NOT special-cased — both are implementations of the same interface.

---

## Engine Extensions (interfaces only — not implemented yet)

The typing engine is a generic, context-free typing measurement instrument. It does NOT understand games, spells, combat, or any gameplay concept. It provides **primitives** that the game layer composes into mechanics.

| Engine Primitive | Game Layer Example |
|---|---|
| Modify untyped characters in sequence | Corruption spell, text scramble |
| Restore modified characters to original | Purify/cleanse skill |
| Invalidate completed characters externally | Curse, damage-over-time |
| Pause/resume input acceptance | Stun, freeze, silence |
| Extend sequence with additional units | Spell destabilization |
| Cancel sequence | Interrupt skill, Escape key |
| Move cursor backward via external command | Powerful disruption skill |

The training tool uses the same engine but never calls modify/invalidate/pause.

### Data model fields (already in core types)

These fields exist in the types now so no breaking changes are needed when game features come online:

- `TypeableUnit.originalExpected` — character at initialization, never changes. Allows restoration.
- `TypeableUnit.modified` — true if `expected` was changed by an external command.
- `TypeableUnit.errorSource` — `'input'` (player mistyped), `'external'` (game effect), or `null`. Analytics uses this to separate player mistakes from external disruptions.
- `TypingState.paused` / `pausedAt` / `pauseRecords` — pause/resume support for stuns, focus loss, etc.

### External command processing (deferred)

`processCommand(state, command) → { state, events }` — same pattern as `processKeystroke`.

```typescript
type ExternalCommand =
  | { type: 'modify_sequence'; changes: { index: number; newExpected: string }[] }
  | { type: 'restore_sequence'; indices: number[] }
  | { type: 'invalidate_completed'; indices: number[] }
  | { type: 'extend_sequence'; additionalUnits: TypeableUnit[] }
  | { type: 'pause_input'; durationMs?: number }
  | { type: 'resume_input' }
  | { type: 'cancel_sequence' }
  | { type: 'set_cursor'; index: number };
```

New events for these commands: `units_modified`, `units_restored`, `completed_invalidated`, `sequence_extended`, `input_paused`, `input_resumed`, `sequence_cancelled`.

### Session context / source tagging (in types, populated with defaults)

```typescript
interface SessionContext {
  source: string;   // Colon-separated hierarchy: 'training:freeform', 'game:battle', etc.
  tags?: string[];  // Optional freeform tags
}
```

Set by the caller, carried through untouched. `source` is NOT an enum — new sources added over time.

### Sequence Manager (deferred)

Manages multiple available actions simultaneously in game mode. Player starts typing → first keystroke locks an action (all actions must have unique first characters). Escape cancels. Not needed for training.

### Progress Snapshot (deferred)

Lightweight, frequent, broadcastable state for other players' UIs (casting bars, real-time status). Contains: sequenceId, cursor, totalLength, correctCount, errorCount, wpm, accuracy, timestamp.

---

## Networking & Multiplayer Architecture (future, do NOT build yet)

### Connection model

One WebSocket per player to game server. No peer-to-peer. Server is authoritative.

### Message flow

- **Player → Server**: `action_started`, `action_completed` (full keystroke log), `action_cancelled`, `action_progress` (every 500ms, lossy-tolerant).
- **Server → All**: `game_state_update`, `effect_applied`, `action_broadcast`, `action_progress_broadcast`, `action_result_broadcast`.
- **Server → Player**: `server_command` (modify sequence, stun), `full_state_snapshot` (connect/reconnect), `available_actions`.

### Game server

.NET tick-based game loop (20 ticks/sec). Per-match state: players with HP/status effects/active sequences, spectators, append-only event log.

### Validation (lightweight for lobby play)

WPM within human range (<250), completion time plausible, player was assigned that action, player not stunned/dead. Full keystroke replay validation optional — data preserved for strict mode later.

### Disconnection handling

- **Short (<10s)**: Defensive state, in-progress action paused (`pause_input`), reconnect sends full snapshot + `resume_input`.
- **Long (>10s)**: AFK, action cancelled, character remains as sitting duck. Reconnect always possible.
- No auto-kick. No game pause.

### Spectators & replays

Spectators receive all broadcast events except private ones (`available_actions`, `server_command`). Append-only event log in Postgres (`match_events` table) enables post-match replays. Replay viewer = spectator client against recorded data. This is event sourcing scoped narrowly to the game event stream only.

---

## Project Layout

```
tyr/
├── CLAUDE.md
├── package.json          # vite + typescript
├── tsconfig.json         # strict, ES2022, Bundler resolution
├── index.html            # Vite entrypoint (root)
├── public/styles.css     # served at /styles.css
├── src/
│   ├── layer0/
│   │   └── keystroke-capture.ts   # capture, normalize, preventDefault
│   ├── layer1/
│   │   ├── types.ts               # TypeableUnit, TypingState, TypingEvent, ProcessResult
│   │   ├── helpers.ts             # MODIFIER_KEYS, isPrintable, cloneUnit, glyphRemaining
│   │   ├── handle-backspace.ts    # backspace logic (step back, clear unit)
│   │   ├── handle-printable.ts    # match/mismatch logic, last-char rule, finish check
│   │   └── typing-state-machine.ts # orchestrator: routes keystroke → handler
│   ├── layer2/
│   │   ├── types.ts               # DomRendererHandle, DomElements, UnitRenderState
│   │   ├── build-dom.ts           # buildLatinDom, buildCjkDom
│   │   ├── glyph-tint.ts         # refreshGlyphTint (red/yellow/green/blue logic)
│   │   ├── dom-renderer.ts       # orchestrator: mount, setState/clearState, event dispatch
│   │   └── canvas-renderer.ts   # alternative Canvas 2D renderer (anti-cheat, game-ready)
│   ├── layer3/
│   │   ├── types.ts               # BigramTiming, SessionAnalytics, TypingSessionResult, etc.
│   │   ├── press-walk.ts         # walkPresses (replay events to extract per-index data)
│   │   ├── analytics.ts          # computeAnalytics, bigram timings, bigram errors
│   │   └── session-recorder.ts   # createSessionRecorder (accumulate + package)
│   ├── text-providers/
│   │   ├── text-provider.ts
│   │   ├── latin-text-provider.ts
│   │   └── cjk-text-provider.ts
│   ├── shared/
│   │   └── protocol.ts            # Rope War message types (client ↔ server)
│   ├── ropewar/
│   │   ├── main.ts                # Rope War client entry point
│   │   ├── connection.ts          # WebSocket client wrapper
│   │   ├── lobby.ts               # Room creation/joining UI
│   │   ├── game.ts                # Game screen — wires engine to server
│   │   ├── rope-renderer.ts       # Rope tug-of-war visualization
│   │   └── stats-screen.ts        # Post-match stats display
│   ├── main.ts                    # wires everything for the demo
│   └── replay.ts                  # session replay (re-feeds events at original timing)
├── server/                        # Rope War WebSocket server (Node.js)
│   ├── src/
│   │   ├── index.ts               # HTTP + WebSocket entry point
│   │   ├── room-manager.ts        # Create/join/leave rooms
│   │   ├── room.ts                # Room state and game logic
│   │   └── texts.ts               # Text pool loading and shuffling
│   └── data/
│       └── texts.json             # 128 English text snippets
├── ropewar.html                   # Rope War client page (Vite serves it)
└── old.js                # legacy reference implementation (do not edit)
```

Run: `npm install` then `npm run dev` (Vite). Typecheck: `npx tsc --noEmit`.
Server: `cd server && npm install && npm run dev`.

---

## Coding Standards

- Pure functions for state transitions. No classes for the state machine.
- `processKeystroke` returns a NEW state — never mutate the input. Enables debugging, replay, undo.
- Interfaces over classes for all types. `type` unions + `as const` instead of `enum`.
- Side effects only at the edges: Layer 0 event listeners, Layer 2 DOM writes.
- No `any`. Narrow `unknown` with type guards.

---

## Key Design Invariants

1. **Timestamp capture is the first op** in every keystroke handler.
2. **State machine is portable** — reimplementable verbatim in C# for server-side validation.
3. **Renderer is a subscriber** — it only reacts to events.
4. **Analytics are derived, not inline** — Layer 1 never computes WPM.
5. **CJK is first-class**, not an afterthought.
6. **No deadlock on the last char** — wrong press on last index does not advance the cursor.

---

## POC Scope

**In**: Layers 0–3, Latin + CJK text providers, demo HTML page with mode switcher, post-session stats display (WPM, accuracy, slowest/worst bigrams), raw event log to console.

**Out**: Angular, backend, database, multiplayer, auth, game mechanics, Canvas/WebGL, ML analytics.

---

## Future (informs current design, not to be built now)

- **Multiplayer**: each client runs Layers 0–3 and streams raw events to server; server runs its own Layer 1 instance per player for validation + broadcast.
- **Game integration**: specialized TextProviders produce action sequences (e.g. "swift strike" for an attack). Layers 0/1/3 reused wholesale.
- **Canvas/WebGL**: swap Layer 2 only.
- **Server-side .NET Layer 1**: 1:1 port. `TypeableUnit` / `TypingState` map to C# records.
- **Postgres analytics pipeline**: raw events stored, background jobs compute cross-session aggregates and personalized drills.
