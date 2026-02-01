import { Sidebar } from './components/Sidebar';
import { useViewStore } from './store/viewStore';
import { SettingsTab } from './features/Settings/SettingsTab';
import { MediaManagerTab } from './features/MediaManager/MediaManagerTab';
import { TimelineTab } from './features/Timeline/TimelineTab';
import { SequenceTab } from './features/Sequence/SequenceTab';
import { ExportTab } from './features/Export/ExportTab';
import { Minus, Square, X } from 'lucide-react';

function App() {
    const { activeTab } = useViewStore();

    const renderContent = () => {
        switch (activeTab) {
            case 'dashboard':
                return <SettingsTab />;
            case 'media':
                return <MediaManagerTab />;
            case 'timeline':
                return <TimelineTab />;
            case 'sequence':
                return <SequenceTab />;
            case 'export':
                return <ExportTab />;
            default:
                return <SettingsTab />;
        }
    };

    return (
        <div className="h-screen w-screen flex flex-col bg-background text-white overflow-hidden">
            {/* Custom Title Bar */}
            <div className="h-8 bg-[#0a0a15] border-b border-white/5 flex items-center justify-between px-4 drag">
                <div className="flex items-center gap-3">
                    <img src="/logo.png" alt="MMMedia Pro" className="h-5 w-auto" />
                    <span className="text-xs font-medium text-white/60">MMMedia Pro</span>
                </div>
                <div className="flex items-center gap-2 no-drag">
                    <button
                        className="h-6 w-6 flex items-center justify-center hover:bg-white/10 rounded transition-colors"
                        onClick={() => window.ipcRenderer.send('window-control', 'minimize')}
                    >
                        <Minus size={14} />
                    </button>
                    <button
                        className="h-6 w-6 flex items-center justify-center hover:bg-white/10 rounded transition-colors"
                        onClick={() => window.ipcRenderer.send('window-control', 'maximize')}
                    >
                        <Square size={12} />
                    </button>
                    <button
                        className="h-6 w-6 flex items-center justify-center hover:bg-red-500/20 rounded transition-colors"
                        onClick={() => window.ipcRenderer.send('window-control', 'close')}
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-hidden">
                    {renderContent()}
                </main>
            </div>
        </div>
    );
}

export default App;
