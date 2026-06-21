import { Sidebar } from './components/Sidebar';
import { useViewStore } from './store/viewStore';
import { SettingsTab } from './features/Settings/SettingsTab';
import { MediaManagerTab } from './features/MediaManager/MediaManagerTab';
import { TimelineTab } from './features/Timeline/TimelineTab';
import { ExportTab } from './features/Export/ExportTab';
import { SequenceViewTab } from './features/SequenceView/SequenceViewTab';
import { GridEditorTab } from './features/GridEditor/GridEditorTab';
import { TrailerRouter } from './features/TrailerGenerator/TrailerRouter';
import { VideoPlayerTab } from './features/VideoPlayer/VideoPlayerTab';
import { GlobalSettingsTab } from './features/GlobalSettings/GlobalSettingsTab';

import { EditsTab } from './features/Edits/EditsTab';
import { ColorLabTab } from './features/ColorLab/ColorLabTab';
import { SpaceBackground } from './components/SpaceBackground';
import { useUserStore } from './store/userStore';
import { Minus, Square, X } from 'lucide-react';
import { useEffect } from 'react';
import { BridgeListener } from './components/BridgeListener';
import { ToastContainer } from './components/Toast';
import { ConfirmDialog } from './components/ConfirmDialog';
import { MMLogo } from './components/MMLogo';
import { AppHealthMonitor } from './components/AppHealthMonitor';

function App() {
    const { activeTab } = useViewStore();
    const { theme, sidebarPosition, enableSpaceBackground } = useUserStore();

    useEffect(() => {
        // Apply theme class to document body
        document.body.className = `theme-${theme}`;
    }, [theme]);

    const renderContent = () => {
        switch (activeTab) {
            case 'dashboard':
                return <SettingsTab />;
            case 'media':
                return <MediaManagerTab />;

            case 'sequence':
                return <SequenceViewTab />;
            case 'grideditor':
                return <GridEditorTab />;
            case 'timeline':
                return <TimelineTab />;
            case 'trailer':
                return <TrailerRouter />;
            case 'global-settings':
                return <GlobalSettingsTab />;
            case 'edits':
                return <EditsTab />;
            case 'colorlab':
                return <ColorLabTab />;
            case 'videoplayer':
                return <VideoPlayerTab />;
            case 'export':
                // Rendered separately below (always-mounted)
                return null;
            default:
                return <SettingsTab />;
        }
    };

    const showSpaceBackground = enableSpaceBackground && activeTab !== 'sequence';

    return (
        <div className={`h-screen w-screen flex flex-col ${showSpaceBackground ? 'bg-transparent' : 'bg-background'} text-white overflow-hidden`}>
            {showSpaceBackground && <SpaceBackground />}
            
            {/* Custom Title Bar */}
            <div className="h-8 bg-[#0a0a15]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-4 drag z-10">
                <div className="flex items-center gap-3">
                    <MMLogo size={24} />
                    <span className="text-xs font-semibold text-white/50 tracking-wide">MMMedia Pro</span>
                </div>
                <div className="flex items-center gap-2 no-drag">
                    <BridgeListener />
                    <button
                        className="h-6 w-6 flex items-center justify-center hover:bg-white/10 rounded transition-colors"
                        onClick={() => window.ipcRenderer.windowControl('minimize')}
                        title="Minimize"
                    >
                        <Minus size={14} />
                    </button>
                    <button
                        className="h-6 w-6 flex items-center justify-center hover:bg-white/10 rounded transition-colors"
                        onClick={() => window.ipcRenderer.windowControl('maximize')}
                        title="Maximize"
                    >
                        <Square size={12} />
                    </button>
                    <button
                        className="h-6 w-6 flex items-center justify-center hover:bg-red-500/20 rounded transition-colors"
                        onClick={() => window.ipcRenderer.windowControl('close')}
                        title="Close"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className={`flex flex-1 overflow-hidden ${sidebarPosition === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
                <Sidebar />
                <main className="flex-1 overflow-hidden relative">
                    {renderContent()}
                    {/* ExportTab is always mounted so render state (progress, log, SpaceFlight) survives navigation */}
                    <div className={activeTab === 'export' ? 'absolute inset-0' : 'hidden'}>
                        <ExportTab />
                    </div>
                </main>
            </div>

            {/* Global UI Overlays */}
            <ToastContainer />
            <ConfirmDialog />
            <AppHealthMonitor />
        </div>
    );
}

export default App;
