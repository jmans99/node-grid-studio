import { useEffect, useId, useState } from 'react';

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

/** A whole-number input. It keeps what you type until you leave the field, then clamps it. */
export function NumberField({ label, value, min, max, disabled, onChange }: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(String(Math.round(value)));
  useEffect(() => setDraft(String(Math.round(value))), [value]);

  const commit = () => {
    const n = Math.round(Number(draft));
    if (draft.trim() === '' || !Number.isFinite(n)) {
      setDraft(String(Math.round(value)));
      return;
    }
    const clamped = Math.min(max, Math.max(min, n));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <div className="field number-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </div>
  );
}
