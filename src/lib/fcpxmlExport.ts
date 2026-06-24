import type { IcuniEdit, IcuniClip } from './icuniEdit';

/**
 * Serializes an IcuniEdit document to Apple FCPXML (v1.9) format.
 * Maps video tracks (V1 as primary spine, V2+ as connected lanes) and
 * audio tracks as connected audio components with proper time offsets and gaps.
 */
export function exportToFCPXML(edit: IcuniEdit): string {
    const { fps } = edit.project;

    // Helper: Convert frame counts to seconds or fraction string
    // FCPXML prefers fraction format (e.g. "100/30s") to prevent floating point rounding errors
    const toTimeStr = (frames: number): string => {
        if (frames <= 0) return '0s';
        return `${frames}/${fps}s`;
    };

    // Extract unique files to declare as resources
    const uniqueFiles = Array.from(new Set(edit.clips.map(c => c.file))).filter(Boolean);
    const assetMap = new Map<string, string>(); // file path -> asset ID
    uniqueFiles.forEach((file, idx) => {
        assetMap.set(file, `r${idx + 2}`);
    });

    // XML document construction
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<!DOCTYPE fcpxml>\n`;
    xml += `<fcpxml version="1.9">\n`;
    xml += `  <resources>\n`;
    xml += `    <format id="r1" name="FFVideoFormatRateUndefined" frameDuration="${toTimeStr(1)}"/>\n`;
    
    // Register assets
    uniqueFiles.forEach((file) => {
        const assetId = assetMap.get(file)!;
        const filename = file.split(/[\\/]/).pop() || 'Asset';
        // XML escape file URL
        const escapedUrl = file.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        xml += `    <asset id="${assetId}" name="${filename}" src="file:///${escapedUrl}" start="0s" hasVideo="1" hasAudio="1"/>\n`;
    });
    
    xml += `  </resources>\n`;
    xml += `  <library>\n`;
    xml += `    <event name="MMMedia Pro Export">\n`;
    xml += `      <project name="${edit.project.name || 'Project'}">\n`;
    
    const totalDurationFrames = edit.clips.reduce((max, c) => Math.max(max, c.timelineEnd), 0);
    xml += `        <sequence duration="${toTimeStr(totalDurationFrames)}" format="r1" tcStart="0s" tcFormat="NDF">\n`;
    xml += `          <spine>\n`;

    // Separate primary track (V1 / video / track 1) from everything else
    const v1Clips = edit.clips
        .filter(c => c.trackType === 'video' && c.track === 1)
        .sort((a, b) => a.timelineStart - b.timelineStart);

    // Connected clips are placed relative to the primary spine items or gaps
    const connectedClips = edit.clips
        .filter(c => !(c.trackType === 'video' && c.track === 1))
        .sort((a, b) => a.timelineStart - b.timelineStart);

    // Spine tracking: keep track of time and build gaps where necessary
    let spineTime = 0;

    // Helper: append child overlays (V2+ or Audio tracks) that overlap with this spine segment
    const appendConnectedClips = (parentStart: number, parentEnd: number): string => {
        let childXml = '';
        const children = connectedClips.filter(cc => cc.timelineStart >= parentStart && cc.timelineStart < parentEnd);
        
        children.forEach(cc => {
            const assetId = assetMap.get(cc.file);
            if (!assetId) return;

            const relativeOffsetFrames = cc.timelineStart - parentStart;
            const durationFrames = cc.timelineEnd - cc.timelineStart;
            const trimStartFrames = cc.sourceStart;

            const lane = cc.trackType === 'video' ? cc.track : -cc.track; // Positive lanes for video overlay, negative for audio

            if (cc.trackType === 'video') {
                childXml += `              <asset-clip ref="${assetId}" offset="${toTimeStr(relativeOffsetFrames)}" name="${cc.name || 'Overlay'}" start="${toTimeStr(trimStartFrames)}" duration="${toTimeStr(durationFrames)}" lane="${lane}">\n`;
                if (cc.volume !== 100) {
                    const volDb = 20 * Math.log10(Math.max(0.01, cc.volume / 100));
                    childXml += `                <audio-adjust volume="${volDb.toFixed(2)}dB"/>\n`;
                }
                childXml += `              </asset-clip>\n`;
            } else {
                // Audio track
                childXml += `              <audio ref="${assetId}" offset="${toTimeStr(relativeOffsetFrames)}" name="${cc.name || 'Audio'}" start="${toTimeStr(trimStartFrames)}" duration="${toTimeStr(durationFrames)}" lane="${lane}">\n`;
                if (cc.volume !== 100) {
                    const volDb = 20 * Math.log10(Math.max(0.01, cc.volume / 100));
                    childXml += `                <audio-adjust volume="${volDb.toFixed(2)}dB"/>\n`;
                }
                childXml += `              </audio>\n`;
            }
        });

        return childXml;
    };

    v1Clips.forEach((c) => {
        // Gap detection
        if (c.timelineStart > spineTime) {
            const gapDur = c.timelineStart - spineTime;
            xml += `            <gap name="Gap" offset="${toTimeStr(spineTime)}" duration="${toTimeStr(gapDur)}">\n`;
            xml += appendConnectedClips(spineTime, c.timelineStart);
            xml += `            </gap>\n`;
            spineTime = c.timelineStart;
        }

        const assetId = assetMap.get(c.file);
        if (assetId) {
            const durationFrames = c.timelineEnd - c.timelineStart;
            const trimStartFrames = c.sourceStart;
            
            xml += `            <asset-clip ref="${assetId}" offset="${toTimeStr(c.timelineStart)}" name="${c.name || 'Video Clip'}" start="${toTimeStr(trimStartFrames)}" duration="${toTimeStr(durationFrames)}">\n`;
            xml += appendConnectedClips(c.timelineStart, c.timelineEnd);
            
            if (c.volume !== 100) {
                const volDb = 20 * Math.log10(Math.max(0.01, c.volume / 100));
                xml += `              <audio-adjust volume="${volDb.toFixed(2)}dB"/>\n`;
            }
            xml += `            </asset-clip>\n`;
            spineTime = c.timelineEnd;
        }
    });

    // Final gap if timeline ends after the last V1 clip
    if (totalDurationFrames > spineTime) {
        const finalGapDur = totalDurationFrames - spineTime;
        xml += `            <gap name="Gap" offset="${toTimeStr(spineTime)}" duration="${toTimeStr(finalGapDur)}">\n`;
        xml += appendConnectedClips(spineTime, totalDurationFrames);
        xml += `            </gap>\n`;
    }

    xml += `          </spine>\n`;
    xml += `        </sequence>\n`;
    xml += `      </project>\n`;
    xml += `    </event>\n`;
    xml += `  </library>\n`;
    xml += `</fcpxml>\n`;

    return xml;
}
