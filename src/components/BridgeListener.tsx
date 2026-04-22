import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useMediaStore, MediaFile } from '../store/mediaStore';
import { useViewStore } from '../store/viewStore';
import { toast } from './Toast';
import { v4 as uuidv4 } from 'uuid';

/**
 * BridgeListener — Listens for incoming data from MMMedia Darkroom via
 * the WebSocket bridge server. Handles connection status, clip/media/folder
 * reception and auto-navigation.
 */
export const BridgeListener: React.FC = () => {
    const [clientCount, setClientCount] = useState<number>(0);
    const addFiles = useMediaStore(state => state.addFiles);
    const { setActiveTab } = useViewStore();

    useEffect(() => {
        if (!window.ipcRenderer) return;

        const unsubConnected = window.ipcRenderer.onBridgeClientConnected((data) => {
            console.log(`[Bridge] Darkroom connected (${data.clientCount} clients)`);
            setClientCount(data.clientCount);
            toast.success(`Darkroom connected`);
        });

        const unsubDisconnected = window.ipcRenderer.onBridgeClientDisconnected((data) => {
            console.log(`[Bridge] Darkroom disconnected (${data.clientCount} clients remaining)`);
            setClientCount(data.clientCount);
        });

        const unsubReceiveClips = window.ipcRenderer.onBridgeReceiveClips((clips) => {
            console.log(`[Bridge] Received ${clips.length} clips from Darkroom!`);
            addFiles(clips);
            toast.success(`Received ${clips.length} clip(s) from Darkroom`);
        });

        const unsubReceiveMedia = window.ipcRenderer.onBridgeReceiveMedia((files) => {
            console.log(`[Bridge] Received ${files.length} media files from Darkroom!`);
            addFiles(files);
            toast.success(`Received ${files.length} file(s) from Darkroom`);
        });

        const unsubReceiveProject = window.ipcRenderer.onBridgeReceiveProject((content) => {
            console.log(`[Bridge] Received project from Darkroom!`);
            toast.info(`Received project from Darkroom`);
        });

        const unsubReceiveFolder = window.ipcRenderer.onBridgeReceiveFolder((data) => {
            console.log(`[Bridge] Received folder "${data.folderPath}" with ${data.files.length} files from Darkroom!`);

            // Convert incoming folder files to MediaFile format
            const mediaFiles: MediaFile[] = data.files.map(f => {
                const ext = f.name.split('.').pop()?.toLowerCase() || '';
                let type: 'video' | 'audio' | 'image' = 'video';
                if (['mp3', 'wav', 'aac', 'flac'].includes(ext)) type = 'audio';
                else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'svg', 'avif'].includes(ext)) type = 'image';

                return {
                    id: uuidv4(),
                    path: f.path,
                    filename: f.name,
                    type: (f.type as any) || type,
                    duration: f.duration || 0,
                    width: f.width,
                    height: f.height,
                    size: f.size,
                    orientation: f.width && f.height
                        ? (f.width > f.height ? 'horizontal' : f.width < f.height ? 'vertical' : 'square')
                        : undefined,
                };
            });

            addFiles(mediaFiles);
            setActiveTab('media');
            toast.success(`Loaded ${mediaFiles.length} files from Darkroom folder`);
        });

        return () => {
            unsubConnected();
            unsubDisconnected();
            unsubReceiveClips();
            unsubReceiveMedia();
            unsubReceiveProject();
            unsubReceiveFolder();
        };
    }, [addFiles, setActiveTab]);

    return (
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border no-drag transition-colors ${
            clientCount > 0 
                ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' 
                : 'bg-white/5 border-white/10 text-white/30'
        }`} title={clientCount > 0 ? "Connected to MMMedia Darkroom" : "Darkroom Offline"}>
            {clientCount > 0 ? <Wifi size={12} className="animate-pulse" /> : <WifiOff size={12} />}
            <span className="text-[10px] font-bold">
                {clientCount > 0 ? 'Darkroom Link' : 'Darkroom Offline'}
            </span>
        </div>
    );
};
