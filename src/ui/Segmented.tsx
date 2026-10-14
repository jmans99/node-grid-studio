import { useId } from 'react';

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** A row of buttons where exactly one is selected. */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  const id = useId();
  return (
    <div className="field">
      <div className="field-head">
        <span id={id}>{label}</span>
      </div>
      <div
        className="segmented"
        role="radiogroup"
        aria-labelledby={id}
        style={{ gridTemplateColumns: `repeat(${options.length <= 3 ? options.length : options.length === 4 ? 2 : 3}, 1fr)` }}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={o.value === value ? 'on' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
