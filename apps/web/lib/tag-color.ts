/**
 * Compute background / foreground / border styles for a Tag chip given its
 * stored hex color. We use a low-alpha overlay for the background so the
 * accent feels consistent with the rest of the violet/jade/cyan tokens, and
 * pick a readable foreground based on relative luminance.
 */

const HEX = /^#?([0-9a-fA-F]{6})$/;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const match = HEX.exec(hex);
    if (!match) return null;
    const cleaned = match[1]!;
    return {
        r: parseInt(cleaned.slice(0, 2), 16),
        g: parseInt(cleaned.slice(2, 4), 16),
        b: parseInt(cleaned.slice(4, 6), 16),
    };
}

/**
 * Per-channel sRGB → linear conversion for the WCAG luminance formula.
 */
function srgbToLinear(c: number): number {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function getLuminance(hex: string): number {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0.5;
    return (
        0.2126 * srgbToLinear(rgb.r) +
        0.7152 * srgbToLinear(rgb.g) +
        0.0722 * srgbToLinear(rgb.b)
    );
}

export interface TagColorStyle {
    bg: string;
    fg: string;
    border: string;
}

/**
 * Returns a style object that mirrors the visual weight of the Badge tokens
 * (12% background overlay, full saturation text, 20% border).
 */
export function tagColor(hex: string): TagColorStyle {
    const rgb = hexToRgb(hex);
    if (!rgb) {
        return {
            bg: "rgba(124, 92, 252, 0.12)",
            fg: "#7c5cfc",
            border: "rgba(124, 92, 252, 0.2)",
        };
    }
    return {
        bg: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16)`,
        fg: hex.startsWith("#") ? hex : `#${hex}`,
        border: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.32)`,
    };
}

/**
 * Curated swatch palette for the ColorPicker. Mirrors the design system
 * tokens (violet/jade/cyan/rose/amber) plus a handful of neutrals that
 * contrast well in dark mode.
 */
export const TAG_SWATCHES = [
    "#7c5cfc", // violet (default)
    "#a78bfa",
    "#60a5fa",
    "#22d3ee", // cyan
    "#00e5a0", // jade
    "#22c55e",
    "#facc15",
    "#f59e0b", // amber
    "#fb923c",
    "#ff4d6d", // rose
    "#ec4899",
    "#94a3b8", // muted
];
