/**
 * Text Templates — Pre-built text overlay templates for professional video production.
 * ════════════════════════════════════════════════════════════════════════════
 * Provides ready-to-use text overlay configurations for:
 *   • Lower thirds (name/title bars)
 *   • Chapter cards (full-screen title reveals)
 *   • Quote cards (pull quotes with attribution)
 *   • End cards (subscribe CTAs)
 *   • Statistics/data displays
 *   • Bullet point reveals
 *   • Subtitle styles (standard, karaoke, animated)
 *
 * Each template defines placeholder keys (e.g. "name", "title") that the user
 * fills in, plus a `generate()` function that produces a fully-typed TextOverlay
 * with appropriate positioning, font sizing, colors, and animation settings.
 */

import type { TextOverlay, TextAnimation } from './textOverlay';

// ── Template ID Union ───────────────────────────────────────────────────────

export type TextTemplateId =
    | 'lower-third-minimal' | 'lower-third-broadcast' | 'lower-third-modern'
    | 'chapter-card-centered' | 'chapter-card-cinematic' | 'chapter-card-bold'
    | 'quote-card' | 'quote-card-minimal'
    | 'end-card-subscribe' | 'end-card-contact'
    | 'statistic-counter' | 'bullet-point'
    | 'subtitle-standard' | 'subtitle-outline' | 'subtitle-box';

// ── Template Interface ──────────────────────────────────────────────────────

export interface TextTemplate {
    id: TextTemplateId;
    name: string;
    category: 'lower-third' | 'chapter' | 'quote' | 'end-card' | 'statistic' | 'subtitle';
    description: string;
    /** Placeholders that the user fills in — key → default value */
    placeholders: Record<string, string>;
    /** Generate a TextOverlay from filled-in placeholders */
    generate: (values: Record<string, string>, durationFrames: number, fps: number) => TextOverlay;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a unique overlay ID combining template id and a timestamp suffix. */
function makeOverlayId(templateId: string): string {
    return `${templateId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Convert frame count + fps to seconds. */
function framesToSeconds(frames: number, fps: number): number {
    return fps > 0 ? frames / fps : 0;
}

// ══════════════════════════════════════════════════════════════════════════════
// TEMPLATE DEFINITIONS
// ══════════════════════════════════════════════════════════════════════════════

// ── Lower Thirds ────────────────────────────────────────────────────────────

const lowerThirdMinimal: TextTemplate = {
    id: 'lower-third-minimal',
    name: 'Lower Third — Minimal',
    category: 'lower-third',
    description: 'Clean name and title bar with a subtle fade, no background. Ideal for interviews and vlogs.',
    placeholders: { name: 'Jane Doe', title: 'Creative Director' },
    generate(values, durationFrames, fps) {
        const dur = framesToSeconds(durationFrames, fps);
        return {
            id: makeOverlayId(this.id),
            text: `${values.name ?? 'Jane Doe'}\n${values.title ?? 'Creative Director'}`,
            fontFamily: 'Arial',
            fontSize: 32,
            fontColor: '#FFFFFF',
            fontWeight: 'normal',
            position: 'bottom-left',
            offsetX: 40,
            offsetY: -60,
            startTime: 0,
            endTime: dur,
            animation: 'fade',
            animationDuration: 0.4,
            opacity: 1.0,
            shadow: true,
        };
    },
};

const lowerThirdBroadcast: TextTemplate = {
    id: 'lower-third-broadcast',
    name: 'Lower Third — Broadcast',
    category: 'lower-third',
    description: 'Bold broadcast-style name plate with a colored background strip.',
    placeholders: { name: 'John Smith', title: 'Senior Correspondent' },
    generate(values, durationFrames, fps) {
        const dur = framesToSeconds(durationFrames, fps);
        return {
            id: makeOverlayId(this.id),
            text: `${values.name ?? 'John Smith'}  |  ${values.title ?? 'Senior Correspondent'}`,
            fontFamily: 'Arial',
            fontSize: 34,
            fontColor: '#FFFFFF',
            fontWeight: 'bold',
            backgroundColor: '#1A1A1ACC',
            position: 'bottom-left',
            offsetX: 0,
            offsetY: -40,
            startTime: 0,
            endTime: dur,
            animation: 'slide-left',
            animationDuration: 0.5,
            opacity: 1.0,
            shadow: false,
        };
    },
};

const lowerThirdModern: TextTemplate = {
    id: 'lower-third-modern',
    name: 'Lower Third — Modern',
    category: 'lower-third',
    description: 'Contemporary two-line lower third with accent border and slide-up entrance.',
    placeholders: { name: 'Alex Rivera', title: 'UX Designer' },
    generate(values, durationFrames, fps) {
        const dur = framesToSeconds(durationFrames, fps);
        return {
            id: makeOverlayId(this.id),
            text: `${values.name ?? 'Alex Rivera'}\n${values.title ?? 'UX Designer'}`,
            fontFamily: 'Helvetica',
            fontSize: 30,
            fontColor: '#F0F0F0',
            fontWeight: 'bold',
            borderColor: '#00AAFF',
            borderWidth: 2,
            position: 'bottom-left',
            offsetX: 40,
            offsetY: -50,
            startTime: 0,
            endTime: dur,
            animation: 'slide-up',
            animationDuration: 0.45,
            opacity: 1.0,
            shadow: true,
        };
    },
};

// ── Chapter Cards ───────────────────────────────────────────────────────────

const chapterCardCentered: TextTemplate = {
    id: 'chapter-card-centered',
    name: 'Chapter Card — Centered',
    category: 'chapter',
    description: 'Full-screen centered chapter title with fade animation. Great for topic transitions.',
    placeholders: { chapter: 'Chapter 1', title: 'Introduction' },
    generate(values, durationFrames, fps) {
        const dur = framesToSeconds(durationFrames, fps);
        return {
            id: makeOverlayId(this.id),
            text: `${values.chapter ?? 'Chapter 1'}\n${values.title ?? 'Introduction'}`,
            fontFamily: 'Georgia',
            fontSize: 64,
            fontColor: '#FFFFFF',
            fontWeight: 'bold',
            position: 'center',
            offsetX: 0,
            offsetY: -20,
            startTime: 0,
            endTime: dur,
            animation: 'fade',
            animationDuration: 0.8,
            opacity: 1.0,
            shadow: true,
        };
    },
};

const chapterCardCinematic: TextTemplate = {
    id: 'chapter-card-cinematic',
    name: 'Chapter Card — Cinematic',
    category: 'chapter',
    description: 'Dramatic cinematic title with large serif font and slow fade. Suited for documentary or film openers.',
    placeholders: { title: 'The Beginning' },
    generate(values, durationFrames, fps) {
        const dur = framesToSeconds(durationFrames, fps);
        return {
            id: makeOverlayId(this.id),
            text: values.title ?? 'The Beginning',
            fontFamily: 'Times New Roman',
            fontSize: 80,
            fontColor: '#E0D8C8',
            fontWeight: 'normal',
            position: 'center',
            offsetX: 0,
            offsetY: -10,
            startTime: 0,
            endTime: dur,
            animation: 'fade',
            animationDuration: 1.2,
            opacity: 0.95,
            shadow: true,
        };
    },
};

const chapterCardBold: TextTemplate = {
    id: 'chapter-card-bold',
    name: 'Chapter Card — Bold',
    category: 'chapter',
    description: 'High-impact bold chapter card with dark background overlay and scale-in entrance.',
    placeholders: { title: 'KEY TAKEAWAYS' },
    generate(values, durationFrames, fps) {
        const dur = framesToSeconds(durationFrames, fps);
        return {
            id: makeOverlayId(this.id),
            text: values.title ?? 'KEY TAKEAWAYS',
            fontFamily: 'Impact',
            fontSize: 72,
            fontColor: '#FFFFFF',
            fontWeight: 'bold',
            backgroundColor: '#000000AA',
            position: 'center',
            offsetX: 0,
            offsetY: -10,
            startTime: 0,
            endTime: dur,
            animation: 'fade',
            animationDuration: 0.6,
            opacity: 1.0,
            shadow: false,
        };
    },
};

// ── Quote Cards ─────────────────────────────────────────────────────────────

const quoteCard: TextTemplate = {
    id: 'quote-card',
    name: 'Quote Card',
    category: 'quote',
    description: 'Elegant pull-quote with attribution line. Uses italic serif font and centered layout.',
    placeholders: { quote: 'The only way to do great work is to love what you do.', attribution: '— Steve Jobs' },
    generate(values, durationFrames, fps) {
        const dur = framesToSeconds(durationFrames, fps);
        const quote = values.quote ?? 'The only way to do great work is to love what you do.';
        const attr = values.attribution ?? '— Steve Jobs';
        return {
            id: makeOverlayId(this.id),
            text: `"${quote}"\n\n${attr}`,
            fontFamily: 'Georgia',
            fontSize: 44,
            fontColor: '#FFFFFF',
            fontWeight: 'normal',
            position: 'center',
            offsetX: 0,
            offsetY: 0,
            startTime: 0,
            endTime: dur,
            animation: 'fade',
            animationDuration: 0.7,
            opacity: 1.0,
            shadow: true,
        };
    },
};

const quoteCardMinimal: TextTemplate = {
    id: 'quote-card-minimal',
    name: 'Quote Card — Minimal',
    category: 'quote',
    description: 'Stripped-down quote display with clean sans-serif type and no background.',
    placeholders: { quote: 'Less is more.', attribution: '— Ludwig Mies van der Rohe' },
    generate(values, durationFrames, fps) {
        const dur = framesToSeconds(durationFrames, fps);
        const quote = values.quote ?? 'Less is more.';
        const attr = values.attribution ?? '— Ludwig Mies van der Rohe';
        return {
            id: makeOverlayId(this.id),
            text: `"${quote}"\n${attr}`,
            fontFamily: 'Helvetica',
            fontSize: 40,
            fontColor: '#E0E0E0',
            fontWeight: 'normal',
            position: 'center',
            offsetX: 0,
            offsetY: 10,
            startTime: 0,
            endTime: dur,
            animation: 'fade',
            animationDuration: 0.5,
            opacity: 0.95,
            shadow: false,
        };
    },
};

// ── End Cards ───────────────────────────────────────────────────────────────

const endCardSubscribe: TextTemplate = {
    id: 'end-card-subscribe',
    name: 'End Card — Subscribe',
    category: 'end-card',
    description: 'YouTube-style subscribe CTA with channel name and call-to-action text.',
    placeholders: { channel: 'My Channel', cta: 'SUBSCRIBE & HIT THE BELL 🔔' },
    generate(values, durationFrames, fps) {
        const dur = framesToSeconds(durationFrames, fps);
        const channel = values.channel ?? 'My Channel';
        const cta = values.cta ?? 'SUBSCRIBE & HIT THE BELL 🔔';
        return {
            id: makeOverlayId(this.id),
            text: `${channel}\n\n${cta}`,
            fontFamily: 'Arial',
            fontSize: 52,
            fontColor: '#FFFFFF',
            fontWeight: 'bold',
            backgroundColor: '#CC000099',
            position: 'center',
            offsetX: 0,
            offsetY: 0,
            startTime: 0,
            endTime: dur,
            animation: 'fade',
            animationDuration: 0.6,
            opacity: 1.0,
            shadow: false,
        };
    },
};

const endCardContact: TextTemplate = {
    id: 'end-card-contact',
    name: 'End Card — Contact',
    category: 'end-card',
    description: 'Professional contact/outro card with multiple info lines.',
    placeholders: { heading: 'Get In Touch', detail: 'hello@example.com\nwww.example.com' },
    generate(values, durationFrames, fps) {
        const dur = framesToSeconds(durationFrames, fps);
        const heading = values.heading ?? 'Get In Touch';
        const detail = values.detail ?? 'hello@example.com\nwww.example.com';
        return {
            id: makeOverlayId(this.id),
            text: `${heading}\n\n${detail}`,
            fontFamily: 'Helvetica',
            fontSize: 42,
            fontColor: '#FFFFFF',
            fontWeight: 'bold',
            backgroundColor: '#222222DD',
            position: 'center',
            offsetX: 0,
            offsetY: 0,
            startTime: 0,
            endTime: dur,
            animation: 'fade',
            animationDuration: 0.8,
            opacity: 1.0,
            shadow: false,
        };
    },
};

// ── Statistic & Bullet ──────────────────────────────────────────────────────

const statisticCounter: TextTemplate = {
    id: 'statistic-counter',
    name: 'Statistic Counter',
    category: 'statistic',
    description: 'Large numeric statistic with a label below. Use for data callouts and KPIs.',
    placeholders: { value: '2.4M', label: 'Monthly Active Users' },
    generate(values, durationFrames, fps) {
        const dur = framesToSeconds(durationFrames, fps);
        const value = values.value ?? '2.4M';
        const label = values.label ?? 'Monthly Active Users';
        return {
            id: makeOverlayId(this.id),
            text: `${value}\n${label}`,
            fontFamily: 'Arial',
            fontSize: 70,
            fontColor: '#00DDFF',
            fontWeight: 'bold',
            position: 'center',
            offsetX: 0,
            offsetY: -10,
            startTime: 0,
            endTime: dur,
            animation: 'fade',
            animationDuration: 0.5,
            opacity: 1.0,
            shadow: true,
        };
    },
};

const bulletPoint: TextTemplate = {
    id: 'bullet-point',
    name: 'Bullet Point',
    category: 'statistic',
    description: 'Single bullet-point line that slides up for sequential data reveals or agenda items.',
    placeholders: { bullet: '• Key insight goes here' },
    generate(values, durationFrames, fps) {
        const dur = framesToSeconds(durationFrames, fps);
        return {
            id: makeOverlayId(this.id),
            text: values.bullet ?? '• Key insight goes here',
            fontFamily: 'Arial',
            fontSize: 36,
            fontColor: '#FFFFFF',
            fontWeight: 'normal',
            position: 'center-left',
            offsetX: 60,
            offsetY: 0,
            startTime: 0,
            endTime: dur,
            animation: 'slide-up',
            animationDuration: 0.35,
            opacity: 1.0,
            shadow: true,
        };
    },
};

// ── Subtitles ───────────────────────────────────────────────────────────────

const subtitleStandard: TextTemplate = {
    id: 'subtitle-standard',
    name: 'Subtitle — Standard',
    category: 'subtitle',
    description: 'Classic white subtitle text at the bottom of the frame with a soft shadow.',
    placeholders: { text: 'This is a subtitle line.' },
    generate(values, durationFrames, fps) {
        const dur = framesToSeconds(durationFrames, fps);
        return {
            id: makeOverlayId(this.id),
            text: values.text ?? 'This is a subtitle line.',
            fontFamily: 'Arial',
            fontSize: 36,
            fontColor: '#FFFFFF',
            fontWeight: 'normal',
            position: 'bottom-center',
            offsetX: 0,
            offsetY: 0,
            startTime: 0,
            endTime: dur,
            animation: 'none',
            animationDuration: 0,
            opacity: 1.0,
            shadow: true,
        };
    },
};

const subtitleOutline: TextTemplate = {
    id: 'subtitle-outline',
    name: 'Subtitle — Outline',
    category: 'subtitle',
    description: 'Subtitle with a dark outline stroke for readability over bright footage.',
    placeholders: { text: 'Outlined subtitle text.' },
    generate(values, durationFrames, fps) {
        const dur = framesToSeconds(durationFrames, fps);
        return {
            id: makeOverlayId(this.id),
            text: values.text ?? 'Outlined subtitle text.',
            fontFamily: 'Arial',
            fontSize: 36,
            fontColor: '#FFFFFF',
            fontWeight: 'bold',
            borderColor: '#000000',
            borderWidth: 3,
            position: 'bottom-center',
            offsetX: 0,
            offsetY: 0,
            startTime: 0,
            endTime: dur,
            animation: 'none',
            animationDuration: 0,
            opacity: 1.0,
            shadow: false,
        };
    },
};

const subtitleBox: TextTemplate = {
    id: 'subtitle-box',
    name: 'Subtitle — Box',
    category: 'subtitle',
    description: 'Subtitle rendered inside a semi-transparent dark box for maximum legibility.',
    placeholders: { text: 'Boxed subtitle text.' },
    generate(values, durationFrames, fps) {
        const dur = framesToSeconds(durationFrames, fps);
        return {
            id: makeOverlayId(this.id),
            text: values.text ?? 'Boxed subtitle text.',
            fontFamily: 'Arial',
            fontSize: 34,
            fontColor: '#FFFFFF',
            fontWeight: 'normal',
            backgroundColor: '#000000BB',
            position: 'bottom-center',
            offsetX: 0,
            offsetY: 0,
            startTime: 0,
            endTime: dur,
            animation: 'none',
            animationDuration: 0,
            opacity: 1.0,
            shadow: false,
        };
    },
};

// ══════════════════════════════════════════════════════════════════════════════
// REGISTRY & ACCESSORS
// ══════════════════════════════════════════════════════════════════════════════

/** Master registry of every built-in text template, keyed by template ID. */
export const TEXT_TEMPLATES: Record<TextTemplateId, TextTemplate> = {
    'lower-third-minimal':      lowerThirdMinimal,
    'lower-third-broadcast':    lowerThirdBroadcast,
    'lower-third-modern':       lowerThirdModern,
    'chapter-card-centered':    chapterCardCentered,
    'chapter-card-cinematic':   chapterCardCinematic,
    'chapter-card-bold':        chapterCardBold,
    'quote-card':               quoteCard,
    'quote-card-minimal':       quoteCardMinimal,
    'end-card-subscribe':       endCardSubscribe,
    'end-card-contact':         endCardContact,
    'statistic-counter':        statisticCounter,
    'bullet-point':             bulletPoint,
    'subtitle-standard':        subtitleStandard,
    'subtitle-outline':         subtitleOutline,
    'subtitle-box':             subtitleBox,
};

/**
 * Retrieve a single text template by its ID.
 * @throws If the template ID is not found in the registry.
 */
export function getTextTemplate(id: TextTemplateId): TextTemplate {
    const template = TEXT_TEMPLATES[id];
    if (!template) {
        throw new Error(`[textTemplates] Unknown template id: "${id}"`);
    }
    return template;
}

/**
 * Return all templates belonging to a given category.
 * @param category - One of the template category strings.
 * @returns Array of matching templates (may be empty for unknown categories).
 */
export function getTemplatesByCategory(category: string): TextTemplate[] {
    return Object.values(TEXT_TEMPLATES).filter(t => t.category === category);
}

/**
 * Convenience shortcut — look up a template and immediately produce a TextOverlay.
 *
 * @param templateId     - Which template to use.
 * @param values         - Placeholder values supplied by the user.
 * @param durationFrames - Desired overlay duration in frames.
 * @param fps            - Timeline frame rate.
 * @returns A fully populated TextOverlay ready for rendering.
 */
export function applyTextTemplate(
    templateId: TextTemplateId,
    values: Record<string, string>,
    durationFrames: number,
    fps: number,
): TextOverlay {
    return getTextTemplate(templateId).generate(values, durationFrames, fps);
}
