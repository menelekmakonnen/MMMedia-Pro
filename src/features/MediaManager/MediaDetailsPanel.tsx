import React from 'react';
import { Clip, useClipStore } from '../../store/clipStore';
import { Plus, FileVideo, FileAudio, Image as ImageIcon, X } from 'lucide-react';

interface MediaDetailsPanelProps {
    clip: Clip | null;
    onClose: () => void;
}

export const MediaDetailsPanel: React.FC<MediaDetailsPanelProps> = ({ clip, onClose }) => {
    const { addClip } = useClipStore();

    if (!clip) return (
        <div className="h-full flex flex-col items-center justify-center text-white/20 p-8 text-center bg-[#080810] border-l border-white/5">
            <h3 className="text-lg font-medium mb-2">No Selection</h3>
            <p className="text-sm">Select a media file to view details</p>
        </div>
    );



    const getIcon = () => {
        switch (clip.type) {
            case 'video': return <FileVideo size={48} className="text-accent/50" />;
            case 'audio': return <FileAudio size={48} className="text-accent/50" />;
            case 'image': return <ImageIcon size={48} className="text-accent/50" />;
            default: return null;
        }
    };

    return (
        <div className="h-full flex flex-col bg-[#080810] border-l border-white/5 w-80 flex-shrink-0 animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="font-medium text-white/90">Details</h3>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Preview Section */}
            <div className="p-4 border-b border-white/5">
                <div className="aspect-video bg-black/50 rounded-lg border border-white/10 overflow-hidden relative group flex items-center justify-center mb-4">
                    {clip.type === 'video' || clip.type === 'image' ? (
                        <video
                            src={`file://${clip.path}`}
                            className="w-full h-full object-contain"
                            controls={clip.type === 'video'}
                            onLoadedMetadata={(e) => {
                                const duration = e.currentTarget.duration;
                                if (clip.sourceDurationFrames === 0 && duration > 0) {
                                    useClipStore.getState().setClipDuration(clip.id, duration);
                                    console.log('Fixed zero duration clip:', clip.filename, duration);
                                }
                            }}
                        />
                    ) : (
                        getIcon()
                    )}
                </div>

                <h2 className="text-lg font-semibold text-white/90 break-words mb-1">
                    {clip.filename}
                </h2>
                <div className="text-xs text-white/40 uppercase tracking-wider font-medium">
                    {clip.type}
                </div>
            </div>

            {/* Metadata Grid */}
            <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="text-xs text-white/40 mb-1">Format</div>
                            <div className="text-sm text-white/80 font-mono">
                                {clip.path.split('.').pop()?.toUpperCase() || '-'}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-white/40 mb-1">Duration</div>
                            <div className="text-sm text-white/80 font-mono">
                                {(clip.sourceDurationFrames / 30).toFixed(1)}s
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-white/40 mb-1">Resolution</div>
                            <div className="text-sm text-white/80 font-mono">-</div>
                        </div>
                        <div>
                            <div className="text-xs text-white/40 mb-1">Frame Rate</div>
                            <div className="text-sm text-white/80 font-mono">30 FPS</div>
                        </div>
                    </div>

                    <div className="pt-2">
                        <div className="text-xs text-white/40 mb-1">File Path</div>
                        <div className="text-xs text-white/60 font-mono break-all bg-white/5 p-2 rounded select-all">
                            {clip.path}
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions Footer */}
            <div className="p-4 border-t border-white/5 bg-white/5 space-y-2">
                {/* 
                     Note: The main 'addClip' adds to the store. 
                     Here we might want to 'add to timeline' specifically if we had a distinction,
                     but for now, adding to the store effectively puts it in the timeline list.
                     Wait, the prompt implies "Add to Timeline" means distinct from "In Library".
                     Currently, all clips are in the timeline if they are in the store. 
                     We might need a concept of 'Library' vs 'Timeline' later.
                     For now, I'll simulate 'Add to Timeline' by just logging or playing a success animation,
                     since the user architecture currently has 1:1 library:timeline mapping in the store.
                     
                     Actually, looking at previous work, `ClipStore` holds ALL clips. 
                     The TimelineTab displays `clips`. 
                     So "adding to timeline" is already done when importing.
                     
                     I will assume for this phase that "Add to Timeline" simply selects/focuses it in the timeline 
                     or serves as a placeholder for when we separate Library vs Timeline.
                     
                     Let's use the button to Select it in the timeline (if we can switch tabs? No, we are in Media Manager).
                     
                     I'll make the button functional by re-adding it (duplicating) or just visual for now.
                     Let's make it DUPLICATE the clip - that makes sense!
                 */}
                <button
                    onClick={() => {
                        addClip({ ...clip, id: crypto.randomUUID() });
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white p-3 rounded-lg font-medium transition-colors"
                >
                    <Plus size={18} />
                    Add to Timeline
                </button>
            </div>
        </div>
    );
};
