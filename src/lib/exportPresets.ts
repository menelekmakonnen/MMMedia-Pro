// Export Presets for MMMedia Pro
// Inspired by Adobe Media Encoder preset library

export type ExportOrientation = 'landscape' | 'portrait' | 'square' | 'auto';
export type ExportQuality = 'draft' | 'standard' | 'master';

export interface ExportPreset {
    id: string;
    name: string;
    category: 'social' | 'professional' | 'hevc' | 'mobile';
    codec: 'libx264' | 'libx265';
    /** Base width for landscape orientation */
    width: number;
    /** Base height for landscape orientation */
    height: number;
    /** Default orientation for this preset */
    defaultOrientation: ExportOrientation;
    /** Target bitrate in kbps (0 = use CRF instead) */
    bitrate: number;
    /** Audio bitrate in kbps */
    audioBitrate: number;
    /** Default FPS (0 = match source) */
    fps: number;
    /** Short description */
    description: string;
    /** File extension */
    ext: string;
}

export const EXPORT_PRESETS: ExportPreset[] = [
    // ── Social Media ──────────────────────────────────────────
    {
        id: 'youtube_1080',
        name: 'YouTube 1080p Full HD',
        category: 'social',
        codec: 'libx264',
        width: 1920, height: 1080,
        defaultOrientation: 'landscape',
        bitrate: 16000,
        audioBitrate: 256,
        fps: 0,
        description: 'High Quality 1080p for YouTube',
        ext: 'mp4',
    },
    {
        id: 'youtube_4k',
        name: 'YouTube 2160p 4K',
        category: 'social',
        codec: 'libx264',
        width: 3840, height: 2160,
        defaultOrientation: 'landscape',
        bitrate: 45000,
        audioBitrate: 320,
        fps: 0,
        description: 'Ultra HD 4K for YouTube',
        ext: 'mp4',
    },
    {
        id: 'instagram_reels',
        name: 'Instagram Reels / Stories',
        category: 'social',
        codec: 'libx264',
        width: 1080, height: 1920,
        defaultOrientation: 'portrait',
        bitrate: 8000,
        audioBitrate: 128,
        fps: 30,
        description: 'Vertical 9:16 for Instagram Reels & Stories',
        ext: 'mp4',
    },
    {
        id: 'tiktok',
        name: 'TikTok',
        category: 'social',
        codec: 'libx264',
        width: 1080, height: 1920,
        defaultOrientation: 'portrait',
        bitrate: 6000,
        audioBitrate: 128,
        fps: 30,
        description: 'Vertical 9:16 optimized for TikTok',
        ext: 'mp4',
    },
    {
        id: 'twitter_720',
        name: 'Twitter / X 720p',
        category: 'social',
        codec: 'libx264',
        width: 1280, height: 720,
        defaultOrientation: 'landscape',
        bitrate: 5000,
        audioBitrate: 128,
        fps: 30,
        description: 'Optimized for Twitter/X feeds',
        ext: 'mp4',
    },
    {
        id: 'twitter_square',
        name: 'Twitter / X Square',
        category: 'social',
        codec: 'libx264',
        width: 720, height: 720,
        defaultOrientation: 'square',
        bitrate: 4000,
        audioBitrate: 128,
        fps: 30,
        description: 'Square format for Twitter/X',
        ext: 'mp4',
    },
    {
        id: 'facebook_1080',
        name: 'Facebook 1080p',
        category: 'social',
        codec: 'libx264',
        width: 1920, height: 1080,
        defaultOrientation: 'landscape',
        bitrate: 12000,
        audioBitrate: 256,
        fps: 0,
        description: 'Full HD for Facebook',
        ext: 'mp4',
    },
    {
        id: 'instagram_square',
        name: 'Instagram Feed (Square)',
        category: 'social',
        codec: 'libx264',
        width: 1080, height: 1080,
        defaultOrientation: 'square',
        bitrate: 6000,
        audioBitrate: 128,
        fps: 30,
        description: 'Square 1:1 for Instagram Feed',
        ext: 'mp4',
    },

    // ── Professional ──────────────────────────────────────────
    {
        id: 'hd_720',
        name: 'HD 720p',
        category: 'professional',
        codec: 'libx264',
        width: 1280, height: 720,
        defaultOrientation: 'landscape',
        bitrate: 0,
        audioBitrate: 256,
        fps: 0,
        description: 'Standard HD 720p H.264',
        ext: 'mp4',
    },
    {
        id: 'hd_1080',
        name: 'Full HD 1080p',
        category: 'professional',
        codec: 'libx264',
        width: 1920, height: 1080,
        defaultOrientation: 'landscape',
        bitrate: 0,
        audioBitrate: 320,
        fps: 0,
        description: 'Full HD 1080p H.264',
        ext: 'mp4',
    },
    {
        id: 'uhd_4k',
        name: '4K UHD 2160p',
        category: 'professional',
        codec: 'libx264',
        width: 3840, height: 2160,
        defaultOrientation: 'landscape',
        bitrate: 0,
        audioBitrate: 320,
        fps: 0,
        description: 'Ultra HD 4K H.264',
        ext: 'mp4',
    },

    // ── HEVC (H.265) ──────────────────────────────────────────
    {
        id: 'hevc_1080',
        name: 'HEVC 1080p',
        category: 'hevc',
        codec: 'libx265',
        width: 1920, height: 1080,
        defaultOrientation: 'landscape',
        bitrate: 0,
        audioBitrate: 256,
        fps: 0,
        description: 'H.265 Full HD — smaller file, same quality',
        ext: 'mp4',
    },
    {
        id: 'hevc_4k',
        name: 'HEVC 4K UHD',
        category: 'hevc',
        codec: 'libx265',
        width: 3840, height: 2160,
        defaultOrientation: 'landscape',
        bitrate: 0,
        audioBitrate: 320,
        fps: 0,
        description: 'H.265 4K — efficient high-res encoding',
        ext: 'mp4',
    },
    {
        id: 'hevc_720',
        name: 'HEVC 720p',
        category: 'hevc',
        codec: 'libx265',
        width: 1280, height: 720,
        defaultOrientation: 'landscape',
        bitrate: 0,
        audioBitrate: 192,
        fps: 0,
        description: 'H.265 HD — compact distribution format',
        ext: 'mp4',
    },

    // ── Mobile ────────────────────────────────────────────────
    {
        id: 'mobile_720',
        name: 'Mobile 720p',
        category: 'mobile',
        codec: 'libx264',
        width: 1280, height: 720,
        defaultOrientation: 'landscape',
        bitrate: 6000,
        audioBitrate: 128,
        fps: 30,
        description: 'Optimized for mobile playback',
        ext: 'mp4',
    },
    {
        id: 'mobile_1080',
        name: 'Mobile 1080p',
        category: 'mobile',
        codec: 'libx264',
        width: 1920, height: 1080,
        defaultOrientation: 'landscape',
        bitrate: 8000,
        audioBitrate: 192,
        fps: 30,
        description: 'High quality for modern devices',
        ext: 'mp4',
    },
    {
        id: 'mobile_4k',
        name: 'Mobile 2160p 4K',
        category: 'mobile',
        codec: 'libx264',
        width: 3840, height: 2160,
        defaultOrientation: 'landscape',
        bitrate: 32000,
        audioBitrate: 256,
        fps: 0,
        description: 'Ultra HD for flagship devices',
        ext: 'mp4',
    },
];

export const PRESET_CATEGORIES = [
    { id: 'social', label: 'Social Media', icon: 'share-2' },
    { id: 'professional', label: 'Professional', icon: 'film' },
    { id: 'hevc', label: 'HEVC (H.265)', icon: 'zap' },
    { id: 'mobile', label: 'Mobile Devices', icon: 'smartphone' },
] as const;

export const FPS_OPTIONS = [
    { value: 0, label: 'Match Source' },
    { value: 24, label: '24 fps (Cinema)' },
    { value: 25, label: '25 fps (PAL)' },
    { value: 30, label: '30 fps' },
    { value: 60, label: '60 fps (Smooth)' },
];

/** Map aspect ratio from project settings to export orientation */
export function aspectRatioToOrientation(ratio: string): ExportOrientation {
    switch (ratio) {
        case '9:16': return 'portrait';
        case '1:1': return 'square';
        case '16:9': case '4:3': case '21:9': return 'landscape';
        default: return 'landscape';
    }
}

/** Estimate output file size in MB */
export function estimateFileSize(
    preset: ExportPreset,
    quality: ExportQuality,
    durationSeconds: number
): number {
    let bitrateKbps: number;
    if (preset.bitrate > 0) {
        bitrateKbps = preset.bitrate;
    } else {
        // Estimate from CRF — rough heuristic based on resolution
        const pixels = preset.width * preset.height;
        const isHevc = preset.codec === 'libx265';
        const crfMultiplier = quality === 'master' ? 1.5 : quality === 'draft' ? 0.4 : 1.0;
        bitrateKbps = (pixels / 1000) * (isHevc ? 0.5 : 0.8) * crfMultiplier;
    }
    const audioBitrateKbps = preset.audioBitrate;
    const totalKbps = bitrateKbps + audioBitrateKbps;
    return (totalKbps * durationSeconds) / 8 / 1024; // MB
}

/** Get the final output dimensions based on preset + orientation override */
export function getOutputDimensions(
    preset: ExportPreset,
    orientation: ExportOrientation
): { w: number; h: number } {
    const baseW = Math.max(preset.width, preset.height);
    const baseH = Math.min(preset.width, preset.height);

    switch (orientation) {
        case 'portrait':
            return { w: baseH, h: baseW };
        case 'square': {
            const side = baseH; // use the smaller dimension
            return { w: side, h: side };
        }
        case 'landscape':
        default:
            return { w: baseW, h: baseH };
    }
}

/** Get quality args (CRF + preset speed) based on quality tier */
export function getQualityArgs(
    quality: ExportQuality,
    codec: string,
    targetBitrate: number
): string[] {
    const isHevc = codec === 'libx265';

    // If preset has a target bitrate, use it with 2-pass style (maxrate + bufsize)
    if (targetBitrate > 0) {
        const args = [
            '-b:v', `${targetBitrate}k`,
            '-maxrate', `${Math.round(targetBitrate * 1.5)}k`,
            '-bufsize', `${Math.round(targetBitrate * 2)}k`,
        ];
        switch (quality) {
            case 'draft':  args.push('-preset', isHevc ? 'fast' : 'veryfast'); break;
            case 'master': args.push('-preset', isHevc ? 'slow' : 'slow'); break;
            default:       args.push('-preset', isHevc ? 'medium' : 'medium'); break;
        }
        return args;
    }

    // No target bitrate — use CRF mode
    switch (quality) {
        case 'draft':
            return ['-crf', isHevc ? '30' : '28', '-preset', isHevc ? 'fast' : 'veryfast'];
        case 'master':
            return ['-crf', isHevc ? '20' : '17', '-preset', isHevc ? 'slow' : 'slow'];
        default: // standard
            return ['-crf', isHevc ? '24' : '20', '-preset', isHevc ? 'medium' : 'medium'];
    }
}
