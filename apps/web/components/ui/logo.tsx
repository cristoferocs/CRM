"use client";

import { useWhiteLabelStore } from "@/stores/white-label.store";

const SIZE_CLASSES = {
    sm: "h-6 text-sm font-semibold",
    md: "h-8 text-base font-semibold",
    lg: "h-12 text-2xl font-bold",
} as const;

interface LogoProps {
    size?: keyof typeof SIZE_CLASSES;
    className?: string;
}

export function Logo({ size = "md", className = "" }: LogoProps) {
    const { logoUrl, platformName } = useWhiteLabelStore((s) => s.settings);
    const sizeClass = SIZE_CLASSES[size];

    if (logoUrl) {
        return (
            <img
                src={logoUrl}
                alt={platformName}
                className={`${sizeClass} w-auto object-contain ${className}`}
            />
        );
    }

    return (
        <span className={`${sizeClass} text-[var(--color-primary)] ${className}`}>
            {platformName}
        </span>
    );
}
