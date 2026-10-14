import { LIMITS } from '../core/settings';
import type { MakeRoom, TitleAlign, TitleFont, TitleSettings, TitleTextColor, TitleWeight } from '../core/types';
import { Segmented } from './Segmented';
import { Slider } from './Slider';
import { Toggle } from './Toggle';

const NAMES: { value: TitleSettings['names']; label: string }[] = [
  { value: 'short', label: 'Short names' },
  { value: 'full', label: 'Full names' },
];
const ROOM: { value: MakeRoom; label: string }[] = [
  { value: 'remove', label: 'Remove' },
  { value: 'push', label: 'Push apart' },
];
const FONTS: { value: TitleFont; label: string }[] = [
  { value: 'Manrope', label: 'Manrope' },
  { value: 'Open Sans', label: 'Open Sans' },
];
const WEIGHTS: { value: string; label: string }[] = [
  { value: '300', label: 'Light' },
  { value: '400', label: 'Regular' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semibold' },
];
const COLOURS: { value: TitleTextColor; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'text', label: 'Text colour' },
  { value: 'offering', label: 'Offering' },
];
const ALIGN: { value: TitleAlign; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Right' },
];

interface Props {
  value: TitleSettings;
  onChange: (next: TitleSettings) => void;
}

/** How offerings appear as title shapes: names, room, placement and text. */
export function TitlesPanel({ value, onChange }: Props) {
  const set = <K extends keyof TitleSettings>(key: K, v: TitleSettings[K]) => onChange({ ...value, [key]: v });
  const moved = Object.keys(value.positions).length > 0;
  return (
    <>
      <Segmented label="Names" value={value.names} options={NAMES} onChange={(v) => set('names', v)} />
      <Toggle label="Wrap titles to two lines" checked={value.wrap} onChange={(v) => set('wrap', v)} />
      {value.wrap && (
        <Slider
          label="Wrap titles longer than"
          value={value.wrapAfter}
          {...LIMITS.wrapAfter}
          unit=" characters"
          onChange={(v) => set('wrapAfter', v)}
        />
      )}
      <Segmented label="Make room" value={value.makeRoom} options={ROOM} onChange={(v) => set('makeRoom', v)} />
      <p className="hint">
        {value.makeRoom === 'remove'
          ? 'The nodes and links under a title are removed.'
          : 'The grid opens up and nearby nodes move away.'}
      </p>
      <Toggle label="Keep categories together" checked={value.keepCategories} onChange={(v) => set('keepCategories', v)} />
      <div className="field-head">
        <span className="hint">Drag a title in the preview to move it.</span>
        <button type="button" className="link-button" disabled={!moved} onClick={() => set('positions', {})}>
          Reset positions
        </button>
      </div>

      <Segmented label="Font" value={value.font} options={FONTS} onChange={(v) => set('font', v)} />
      <Segmented
        label="Weight"
        value={String(value.weight)}
        options={WEIGHTS}
        onChange={(v) => set('weight', Number(v) as TitleWeight)}
      />
      <Slider label="Text size" value={value.size} {...LIMITS.titleSize} onChange={(v) => set('size', v)} />
      <Slider
        label="Lead text size"
        value={value.leadScale}
        {...LIMITS.leadScale}
        unit="×"
        onChange={(v) => set('leadScale', v)}
      />
      <Segmented label="Text colour" value={value.textColor} options={COLOURS} onChange={(v) => set('textColor', v)} />
      <Segmented label="Alignment" value={value.align} options={ALIGN} onChange={(v) => set('align', v)} />
      <Slider label="Padding" value={value.padding} {...LIMITS.titlePadding} onChange={(v) => set('padding', v)} />
      <Slider
        label="Included tint"
        value={value.includedTint}
        {...LIMITS.includedTint}
        onChange={(v) => set('includedTint', v)}
      />
      <Toggle label="Outline included titles" checked={value.includedOutline} onChange={(v) => set('includedOutline', v)} />
    </>
  );
}
