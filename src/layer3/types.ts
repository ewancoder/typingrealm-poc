/**
  * Layer 3 — Type definitions for the session recorder and analytics.
  *
  * These types define what a completed typing session looks like (the
  * result object) and how analytics are structured. They're the contract
  * between the recorder, the analytics engine, and the UI that displays
  * post-session stats.
  */

import type { KeystrokeInput } from '../layer0/keystroke-capture.js';
import type { PauseRecord, TypeableUnit } from '../layer1/types.js';

// ---------------------------------------------------------------------------
// Bigram analytics types
// ---------------------------------------------------------------------------

/**
  * Average timing for a two-character transition (bigram).
  *
  * Example: if the bigram "th" had press-to-press times of 120ms and 140ms,
  * this would be { bigram: "th", avgMs: 130, count: 2 }.
  *
  * Sorted slowest-first in the final analytics — the slowest bigrams are
  * the user's weak spots for targeted drills.
  */
export interface BigramTiming {
    bigram: string;
    avgMs: number;
    count: number;
}

/**
  * Error rate for a two-character transition.
  *
  * Example: if the user hit the wrong key 2 out of 5 attempts on the
  * transition "th", this would be { bigram: "th", errorRate: 0.4, count: 5 }.
  *
  * Sorted worst-first — the most error-prone bigrams reveal patterns like
  * consistently confusing 'i' and 'o', or stumbling on 'qu'.
  */
export interface BigramErrorStat {
    bigram: string;
    errorRate: number;
    count: number;
}

// ---------------------------------------------------------------------------
// Session analytics
// ---------------------------------------------------------------------------

/**
  * Derived analytics for a completed typing session.
  *
  * Everything here is COMPUTED from the raw event log + final sequence
  * snapshot. It can be recomputed at any time — on the client for instant
  * feedback, or on the server for trust/verification.
  */
export interface SessionAnalytics {
    /**
      * Words per minute — only "clean" characters count.
      * Clean = completed AND never failed. 5 chars = 1 word.
      */
    wpm: number;

    /**
      * Raw WPM — counts ALL printable key presses, including mistakes
      * and retypes. Shows total typing speed before accuracy adjustment.
      */
    rawWpm: number;

    /**
      * Accuracy = 1 − (everFailed / totalChars).
      * A value of 0.95 means 95% of characters were typed correctly
      * on the first attempt.
      */
    accuracy: number;

    /** Total characters that were ever typed incorrectly. */
    totalErrors: number;

    /** Characters that were wrong but later corrected via backspace. */
    correctedErrors: number;

    /** Press-to-press timing for consecutive correct chars, sorted slowest first. */
    bigramTimings: BigramTiming[];

    /** Per-transition error rates, sorted worst first. */
    bigramErrors: BigramErrorStat[];
}

// ---------------------------------------------------------------------------
// Session context (source tagging)
// ---------------------------------------------------------------------------

/**
  * Metadata about where a typing session was produced.
  * Enables filtering analytics by context (training vs game, drill type, etc.).
  *
  * Set by the caller when creating a session, NOT by the engine. The engine
  * carries it through to the result untouched.
  *
  * `source` is NOT an enum — new sources will be added over time. The app
  * layers define their own string constants. The engine treats it as opaque.
  *
  * Examples:
  *   'training:freeform'
  *   'training:drill:bigrams'
  *   'game:battle'
  *   'game:training-grounds'
  */
export interface SessionContext {
    /** Colon-separated hierarchical source identifier. */
    source: string;

    /** Optional freeform tags for additional filtering. */
    tags?: string[];
}

// ---------------------------------------------------------------------------
// Session result (the final output)
// ---------------------------------------------------------------------------

/**
  * The complete result of a typing session — everything needed to review,
  * store, or replay the session.
  *
  * `events` is the source of truth. `analytics` is derived and can be
  * recomputed from events + the final sequence at any time.
  */
export interface TypingSessionResult {
    /** The source text the user was typing. */
    text: string;

    /**
      * The final state of every typeable unit (completed, failed flags, etc.).
      * Stored so analytics can be recomputed from events + finalSequence at
      * any time — client-side for instant feedback, server-side for trust.
      */
    finalSequence: TypeableUnit[];

    /** ISO timestamp when the first keystroke happened. */
    startedAt: string;

    /** ISO timestamp when the session finished. */
    finishedAt: string;

    /** The user's timezone (e.g. "America/New_York"). */
    timezone: string;

    /** UTC offset in minutes (positive = east of UTC). */
    timezoneOffset: number;

    /** Which input mode was used for this session. */
    inputMode: 'guided' | 'composition';

    /** Context about where this session was produced. */
    context: SessionContext;

    /** History of pause intervals (stuns, focus loss, etc.). */
    pauseRecords: PauseRecord[];

    /** The complete raw keystroke log (presses AND releases). */
    events: KeystrokeInput[];

    /** Derived analytics (WPM, accuracy, bigrams, etc.). */
    analytics: SessionAnalytics;
}

// ---------------------------------------------------------------------------
// Recorder interface
// ---------------------------------------------------------------------------

/**
  * The public interface of the session recorder.
  *
  * Usage:
  *   1. Create with createSessionRecorder().
  *   2. Call record() for every keystroke (press and release) during the session.
  *   3. When the session finishes, call buildResult() to get the final output.
  */
export interface SessionRecorder {
    /** Record a raw keystroke event (called by main.ts on every key). */
    record(event: KeystrokeInput): void;

    /** Get the raw event log so far (read-only view). */
    getEvents(): readonly KeystrokeInput[];

    /** Build the final session result with computed analytics. */
    buildResult(params: {
        sourceText: string;
        finalSequence: TypeableUnit[];
        startedAtMs: number;
        finishedAtMs: number;
        startedAtPerf: number;
        finishedAtPerf: number;
    }): TypingSessionResult;
}
