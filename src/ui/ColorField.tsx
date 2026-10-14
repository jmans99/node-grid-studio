import { useEffect, useId, useState } from 'react';
import { BRAND_SWATCHES } from '../brand';
import { normalizeHex } from '../core/color';

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}

/** Colour picker, hex input and quick-pick dots for the brand colours. */
export function ColorField({ label, value, onChange, disabled }: ColorFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const type = (text: string) => {
    setDraft(text);
    const hex = normalizeHex(text);
    if (hex) onChange(hex);
  };

  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
      </div>
      <div className="color-row">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={normalizeHex(value)?.toLowerCase() ?? '#000000'}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
        <input
          id={id}
          className="hex"
          type="text"
          spellCheck={false}
          maxLength={7}
          value={draft}
          disabled={disabled}
          onChange={(e) => type(e.target.value)}
          onBlur={() => setDraft(value)}
        />
        <div className="swatches">
          {BRAND_SWATCHES.map((s) => (
            <button
              key={s.hex}
              type="button"
              className="swatch"
              style={{ background: s.hex }}
              disabled={disabled}
              title={`${s.name} ${s.hex}${s.note ? ` (${s.note})` : ''}`}
              aria-label={`Use ${s.name}`}
              onClick={() => onChange(s.hex)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
