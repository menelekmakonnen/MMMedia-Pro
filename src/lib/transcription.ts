/**
 * Transcription System — Speech-to-text pipeline orchestrator.
 * ════════════════════════════════════════════════════════════════════════════════
 * Manages audio transcription for Video Essay and Short Film workflows.
 * Provides interfaces for transcription results and orchestrates the pipeline
 * from audio extraction to word-level timestamped output.
 *
 * Actual ASR (Automatic Speech Recognition) would be handled by either:
 *   • Transformers.js Whisper model running in a Web Worker (local, offline)
 *   • External API (OpenAI Whisper, Google Speech-to-Text)
 *
 * This module defines the data structures, manages the pipeline state,
 * and provides the text processing utilities for downstream consumers.
 */

// ─── Transcription Types ────────────────────────────────────────────────────

export interface TranscriptionWord {
    /** The transcribed word */
    text: string;
    /** Start time in seconds */
    start: number;
    /** End time in seconds */
    end: number;
    /** Confidence score 0-1 */
    confidence: number;
    /** Speaker identifier (if diarization is available) */
    speaker?: string;
}

export interface TranscriptionSegment {
    /** Unique segment ID */
    id: string;
    /** Full segment text */
    text: string;
    /** Start time in seconds */
    start: number;
    /** End time in seconds */
    end: number;
    /** Individual words with timestamps */
    words: TranscriptionWord[];
    /** Language detection */
    language?: string;
    /** Average confidence for this segment */
    avgConfidence: number;
    /** Speaker label (if multi-speaker) */
    speaker?: string;
}

export interface TranscriptionResult {
    /** Source clip or file ID */
    sourceId: string;
    /** Full transcription text */
    fullText: string;
    /** Timestamped segments */
    segments: TranscriptionSegment[];
    /** All words flattened (for word-level operations) */
    words: TranscriptionWord[];
    /** Detected language */
    language: string;
    /** Total audio duration in seconds */
    duration: number;
    /** When transcription was performed */
    transcribedAt: number;
    /** Which model/service was used */
    model: string;
}

export type TranscriptionStatus = 'idle' | 'extracting-audio' | 'transcribing' | 'completed' | 'error';

export interface TranscriptionProgress {
    status: TranscriptionStatus;
    progress: number;           // 0-100
    currentSegment?: string;    // text of segment being processed
    error?: string;
}

// ─── Text Processing Utilities ──────────────────────────────────────────────

/**
 * Find the word at a specific timestamp in a transcription.
 * Returns the word and its index, or null if no word at that time.
 */
export function findWordAtTime(
    words: TranscriptionWord[],
    timeSec: number,
): { word: TranscriptionWord; index: number } | null {
    for (let i = 0; i < words.length; i++) {
        if (timeSec >= words[i].start && timeSec <= words[i].end) {
            return { word: words[i], index: i };
        }
    }
    return null;
}

/**
 * Get the text of a time range from a transcription.
 */
export function getTextInRange(
    words: TranscriptionWord[],
    startSec: number,
    endSec: number,
): string {
    return words
        .filter(w => w.start >= startSec && w.end <= endSec)
        .map(w => w.text)
        .join(' ');
}

/**
 * Find sentence boundaries in transcription words.
 * A sentence boundary is detected at punctuation marks (., !, ?, ;)
 * followed by a pause > threshold.
 *
 * @returns Array of sentence objects with start/end times and text.
 */
export function findSentenceBoundaries(
    words: TranscriptionWord[],
    pauseThreshold: number = 0.5,
): Array<{ text: string; start: number; end: number }> {
    if (words.length === 0) return [];

    const sentences: Array<{ text: string; start: number; end: number }> = [];
    let sentenceWords: TranscriptionWord[] = [];

    for (let i = 0; i < words.length; i++) {
        sentenceWords.push(words[i]);

        const isPunctuated = /[.!?;]$/.test(words[i].text);
        const hasGap = i < words.length - 1
            ? (words[i + 1].start - words[i].end) > pauseThreshold
            : true;
        const isLast = i === words.length - 1;

        if ((isPunctuated && hasGap) || isLast) {
            if (sentenceWords.length > 0) {
                sentences.push({
                    text: sentenceWords.map(w => w.text).join(' '),
                    start: sentenceWords[0].start,
                    end: sentenceWords[sentenceWords.length - 1].end,
                });
                sentenceWords = [];
            }
        }
    }

    return sentences;
}

/**
 * Split transcription into paragraphs based on longer pauses.
 * Paragraph breaks occur at pauses > threshold.
 *
 * @returns Array of paragraph objects.
 */
export function findParagraphBreaks(
    segments: TranscriptionSegment[],
    pauseThreshold: number = 2.0,
): Array<{ text: string; start: number; end: number; segmentIds: string[] }> {
    if (segments.length === 0) return [];

    const paragraphs: Array<{ text: string; start: number; end: number; segmentIds: string[] }> = [];
    let paraSegments: TranscriptionSegment[] = [];

    for (let i = 0; i < segments.length; i++) {
        paraSegments.push(segments[i]);

        const hasLongPause = i < segments.length - 1
            ? (segments[i + 1].start - segments[i].end) > pauseThreshold
            : true;
        const isLast = i === segments.length - 1;

        if (hasLongPause || isLast) {
            if (paraSegments.length > 0) {
                paragraphs.push({
                    text: paraSegments.map(s => s.text).join(' '),
                    start: paraSegments[0].start,
                    end: paraSegments[paraSegments.length - 1].end,
                    segmentIds: paraSegments.map(s => s.id),
                });
                paraSegments = [];
            }
        }
    }

    return paragraphs;
}

/**
 * Identify speakers from transcription data.
 * Returns unique speaker labels and their total speaking time.
 */
export function analyzeSpeakers(
    words: TranscriptionWord[],
): Array<{ speaker: string; totalDuration: number; wordCount: number }> {
    const map = new Map<string, { duration: number; count: number }>();

    for (const w of words) {
        const speaker = w.speaker || 'default';
        const entry = map.get(speaker) || { duration: 0, count: 0 };
        entry.duration += w.end - w.start;
        entry.count++;
        map.set(speaker, entry);
    }

    return Array.from(map.entries()).map(([speaker, data]) => ({
        speaker,
        totalDuration: Math.round(data.duration * 100) / 100,
        wordCount: data.count,
    }));
}

/**
 * Generate subtitle cues from transcription words.
 * Groups words into subtitle lines (max N words per line, max duration).
 */
export function generateSubtitleCues(
    words: TranscriptionWord[],
    maxWordsPerCue: number = 8,
    maxCueDuration: number = 5,   // seconds
): Array<{ text: string; start: number; end: number }> {
    const cues: Array<{ text: string; start: number; end: number }> = [];
    let cueWords: TranscriptionWord[] = [];

    for (const w of words) {
        cueWords.push(w);

        const duration = w.end - cueWords[0].start;
        const atLimit = cueWords.length >= maxWordsPerCue || duration >= maxCueDuration;
        const isPunctuated = /[.!?,;]$/.test(w.text);

        if (atLimit || isPunctuated) {
            cues.push({
                text: cueWords.map(cw => cw.text).join(' '),
                start: cueWords[0].start,
                end: cueWords[cueWords.length - 1].end,
            });
            cueWords = [];
        }
    }

    // Flush remaining
    if (cueWords.length > 0) {
        cues.push({
            text: cueWords.map(cw => cw.text).join(' '),
            start: cueWords[0].start,
            end: cueWords[cueWords.length - 1].end,
        });
    }

    return cues;
}

/**
 * Convert word-level transcription to SRT format string.
 */
export function toSRT(
    cues: Array<{ text: string; start: number; end: number }>,
): string {
    const pad = (n: number, d: number = 2) => String(Math.floor(n)).padStart(d, '0');
    const formatTime = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        const ms = Math.round((sec % 1) * 1000);
        return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
    };

    return cues.map((cue, i) => (
        `${i + 1}\n${formatTime(cue.start)} --> ${formatTime(cue.end)}\n${cue.text}\n`
    )).join('\n');
}

/**
 * Convert word-level transcription to WebVTT format string.
 */
export function toWebVTT(
    cues: Array<{ text: string; start: number; end: number }>,
): string {
    const pad = (n: number, d: number = 2) => String(Math.floor(n)).padStart(d, '0');
    const formatTime = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        const ms = Math.round((sec % 1) * 1000);
        return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
    };

    const lines = ['WEBVTT\n'];
    cues.forEach((cue, i) => {
        lines.push(`${i + 1}`);
        lines.push(`${formatTime(cue.start)} --> ${formatTime(cue.end)}`);
        lines.push(cue.text);
        lines.push('');
    });

    return lines.join('\n');
}

// ─── Transcription Store Interface ──────────────────────────────────────────

/**
 * Store shape for transcription data.
 * Used by transcriptionStore.ts (Zustand).
 */
export interface TranscriptionStoreState {
    transcriptions: Map<string, TranscriptionResult>;
    progress: TranscriptionProgress;

    // Actions
    setTranscription: (sourceId: string, result: TranscriptionResult) => void;
    removeTranscription: (sourceId: string) => void;
    clearAll: () => void;
    getTranscription: (sourceId: string) => TranscriptionResult | undefined;
    setProgress: (progress: TranscriptionProgress) => void;
}
