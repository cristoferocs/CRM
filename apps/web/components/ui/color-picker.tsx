"use client";

import * as React from "react";
import { HexColorPicker, HslColorPicker, RgbColorPicker } from "react-colorful";
import { cn } from "@/lib/utils";
import { TAG_SWATCHES } from "@/lib/tag-color";

type Mode = "hex" | "hsl" | "rgb";

export interface ColorPickerProps {
    value: string;
    onChange: (hex: string) => void;
    className?: string;
}

// ---------------------------------------------------------------------------
// Color-space helpers — react-colorful's HslColorPicker / RgbColorPicker work
// with their own object shapes; we round-trip through hex so the outer API
// stays a single string.
// ---------------------------------------------------------------------------

function hexToRgb(hex: string) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return { r: 124, g: 92, b: 252 };
    const v = m[1]!;
    return {
        r: parseInt(v.slice(0, 2), 16),
        g: parseInt(v.slice(2, 4), 16),
        b: parseInt(v.slice(4, 6), 16),
    };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
    const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
        else if (max === gn) h = (bn - rn) / d + 2;
        else h = (rn - gn) / d + 4;
        h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb({ h, s, l }: { h: number; s: number; l: number }) {
    const sn = s / 100, ln = l / 100;
    const c = (1 - Math.abs(2 * ln - 1)) * sn;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = ln - c / 2;
    let rp = 0, gp = 0, bp = 0;
    if (h < 60) [rp, gp, bp] = [c, x, 0];
    else if (h < 120) [rp, gp, bp] = [x, c, 0];
    else if (h < 180) [rp, gp, bp] = [0, c, x];
    else if (h < 240) [rp, gp, bp] = [0, x, c];
    else if (h < 300) [rp, gp, bp] = [x, 0, c];
    else [rp, gp, bp] = [c, 0, x];
    return {
        r: Math.round((rp + m) * 255),
        g: Math.round((gp + m) * 255),
        b: Math.round((bp + m) * 255),
    };
}

// ---------------------------------------------------------------------------

export function ColorPicker({ value, onChange, className }: ColorPickerProps) {
    const [mode, setMode] = React.useState<Mode>("hex");
    const [hexInput, setHexInput] = React.useState(value);

    React.useEffect(() => setHexInput(value), [value]);

    const commitHex = (hex: string) => {
        const normalized = hex.startsWith("#") ? hex : `#${hex}`;
        if (/^#[0-9a-fA-F]{6}$/.test(normalized)) onChange(normalized);
    };

    return (
        <div className={cn("flex flex-col gap-3", className)}>
            <div className="flex gap-1 rounded-[8px] bg-surface-3 p-0.5 text-[11px]">
                {(["hex", "hsl", "rgb"] as const).map((m) => (
                    <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={cn(
                            "flex-1 rounded-[6px] py-1 font-mono uppercase tracking-widest transition-colors",
                            mode === m ? "bg-surface text-t1" : "text-t3 hover:text-t2",
                        )}
                    >
                        {m}
                    </button>
                ))}
            </div>

            <div className="overflow-hidden rounded-[10px]">
                {mode === "hex" && (
                    <HexColorPicker color={value} onChange={onChange} style={{ width: "100%", height: 160 }} />
                )}
                {mode === "hsl" && (
                    <HslColorPicker
                        color={rgbToHsl(hexToRgb(value))}
                        onChange={(hsl) => onChange(rgbToHex(hslToRgb(hsl)))}
                        style={{ width: "100%", height: 160 }}
                    />
                )}
                {mode === "rgb" && (
                    <RgbColorPicker
                        color={hexToRgb(value)}
                        onChange={(rgb) => onChange(rgbToHex(rgb))}
                        style={{ width: "100%", height: 160 }}
                    />
                )}
            </div>

            <div className="flex items-center gap-2">
                <div
                    className="h-7 w-7 shrink-0 rounded-[6px] border border-rim"
                    style={{ backgroundColor: value }}
                    aria-hidden
                />
                <input
                    value={hexInput}
                    onChange={(e) => setHexInput(e.target.value)}
                    onBlur={() => commitHex(hexInput)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            commitHex(hexInput);
                        }
                    }}
                    className="flex-1 rounded-[8px] border border-rim bg-surface-3 px-2 py-1 font-mono text-[12px] text-t1 outline-none focus:border-violet/40"
                    spellCheck={false}
                    aria-label="Cor em hexadecimal"
                />
            </div>

            <div className="grid grid-cols-6 gap-1">
                {TAG_SWATCHES.map((swatch) => (
                    <button
                        key={swatch}
                        type="button"
                        onClick={() => onChange(swatch)}
                        className={cn(
                            "h-6 rounded-[6px] border border-rim transition-transform hover:scale-110",
                            value.toLowerCase() === swatch.toLowerCase() && "ring-2 ring-violet/60",
                        )}
                        style={{ backgroundColor: swatch }}
                        aria-label={`Selecionar cor ${swatch}`}
                    />
                ))}
            </div>
        </div>
    );
}
