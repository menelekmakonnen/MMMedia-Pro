import React from 'react';
import { Clip, useClipStore } from '../../store/clipStore';
import { Plus, FileVideo, FileAudio, Image as ImageIcon, X, RotateCw } from 'lucide-react';

interface MediaDetailsPanelProps {
    clip: Clip | null;
    onClose: () => void;
    onAdd?: () => void;
    onRotate?: () => void;
}

export const MediaDetailsPanel: React.FC<MediaDetailsPanelProps> = ({ clip, onClose, onAdd, onRotate }) => {
    const { addClip } = useClipStore();

    if (!clip) return (
        <div className="h-full flex flex-col items-center justify-center text-white/20 p-8 text-center bg-[#080810]">
            <FileVideo size={40} className="text-white/10 mb-4" />
            <h3 className="text-sm font-bold text-white/30 mb-1">No Selection</h3>
            <p className="text-[11px] text-white/20">Click a media file to view details and controls.</p>
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

    const rotation = clip.rotation || 0;

    return (
        <div className="h-full flex flex-col bg-[#080810] flex-shrink-0 animate-in slide-in-from-right duration-200">
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
                            style={rotation ? { transform: `rotate(${rotation}deg)` } : undefined}
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
                <div className="text-xs text-white/40 uppercase tracking-wider font-medium flex items-center gap-2">
                    <span>{clip.type}</span>
                    {rotation > 0 && (
                        <span className="text-blue-400/60 font-mono text-[10px]">{rotation}°</span>
                    )}
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
                            <div className="text-xs text-white/40 mb-1">Rotation</div>
                            <div className="text-sm text-white/80 font-mono">{rotation}°</div>
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
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            if (onAdd) {
                                onAdd();
                            } else {
                                addClip({ ...clip, id: crypto.randomUUID(), origin: 'manual' });
                            }
                        }}
                        className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white p-3 rounded-lg font-medium transition-colors"
                    >
                        <Plus size={18} />
                        Add to Edit
                    </button>
                    {onRotate && clip.type === 'video' && (
                        <button
                            onClick={onRotate}
                            className="flex items-center justify-center gap-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 p-3 rounded-lg font-medium transition-colors border border-blue-500/20 hover:border-blue-500/40"
                            title={`Rotate (currently ${rotation}°)`}
                        >
                            <RotateCw size={18} />
                        </button>
                    )}
                </div>
            </div>
        </div >
    );
};
