import { create } from "zustand";
import { DEFAULT_WHITE_LABEL, type WhiteLabelPublicSettings } from "@/lib/white-label";

interface WhiteLabelStore {
    settings: WhiteLabelPublicSettings;
    isLoaded: boolean;
    setSettings: (settings: WhiteLabelPublicSettings) => void;
}

export const useWhiteLabelStore = create<WhiteLabelStore>((set) => ({
    settings: DEFAULT_WHITE_LABEL,
    isLoaded: false,
    setSettings: (settings) => set({ settings, isLoaded: true }),
}));
