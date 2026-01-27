import { create } from 'zustand';
import { TabId } from '../types';

interface ViewState {
    activeTab: TabId;
    setActiveTab: (tab: TabId) => void;
}

export const useViewStore = create<ViewState>((set) => ({
    activeTab: 'dashboard',
    setActiveTab: (tab) => set({ activeTab: tab })
}));
