"use client";

import { useEffect } from "react";
import { applyWhiteLabel, type WhiteLabelPublicSettings } from "@/lib/white-label";
import { useWhiteLabelStore } from "@/stores/white-label.store";

interface WhiteLabelProviderProps {
    settings: WhiteLabelPublicSettings;
}

export function WhiteLabelProvider({ settings }: WhiteLabelProviderProps) {
    const setSettings = useWhiteLabelStore((s) => s.setSettings);

    useEffect(() => {
        applyWhiteLabel(settings);
        setSettings(settings);
    }, [settings, setSettings]);

    return null;
}
