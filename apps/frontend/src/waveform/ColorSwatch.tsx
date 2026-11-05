import { useRef } from "react";

export interface ColorSwatchProps {
  color: string;
  label: string;
  onChange: (color: string) => void;
}

/** A clickable color swatch backed by a native <input type="color"> — no extra dependency needed. */
export function ColorSwatch({ color, label, onChange }: ColorSwatchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <span className="color-swatch" style={{ display: "inline-flex", position: "relative" }}>
      <button
        type="button"
        className="color-swatch__button"
        aria-label={`Change color for ${label}`}
        title={`Change color for ${label}`}
        onClick={() => inputRef.current?.click()}
        style={{
          background: color,
          border: "1px solid rgba(255,255,255,0.3)",
          borderRadius: "3px",
          cursor: "pointer",
          height: "12px",
          padding: 0,
          width: "12px",
        }}
      />
      <input
        ref={inputRef}
        type="color"
        aria-label={`${label} color`}
        value={color}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: 0,
          opacity: 0,
          pointerEvents: "none",
          position: "absolute",
          width: 0,
        }}
      />
    </span>
  );
}

export default ColorSwatch;
