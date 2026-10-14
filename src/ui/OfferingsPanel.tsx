import { useId, useState } from 'react';
import { AUDIENCE_PRESETS } from '../offerings';
import { lighten, readableOn } from '../core/color';
import {
  addCategory,
  addOffering,
  applyPreset,
  cycleState,
  matchingPreset,
  removeCategory,
  removeOffering,
  resolveOfferings,
  shadeFor,
  updateCategory,
  updateOffering,
} from '../core/offerings';
import { LIMITS } from '../core/settings';
import type { OfferingState, OfferingsSettings } from '../core/types';
import { Slider } from './Slider';

const STATE_LABEL: Record<OfferingState, string> = { off: 'Off', included: 'Included', lead: 'Lead' };

interface Props {
  value: OfferingsSettings;
  onChange: (next: OfferingsSettings) => void;
}

/** Offerings: audience presets, the list with states and colours, and adding new ones. */
export function OfferingsPanel({ value, onChange }: Props) {
  const resolved = resolveOfferings(value);
  const active = matchingPreset(value);
  const activeCount = value.items.filter((i) => i.state !== 'off').length;

  return (
    <>
      <div className="field">
        <div className="field-head">
          <span>Audience</span>
          <button
            type="button"
            className="link-button"
            disabled={!activeCount}
            onClick={() => onChange({ ...value, items: value.items.map((i) => ({ ...i, state: 'off' })) })}
          >
            Clear all
          </button>
        </div>
        <div className="preset-list">
          {AUDIENCE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={active?.id === p.id && activeCount ? 'on' : ''}
              aria-pressed={active?.id === p.id && activeCount > 0}
              onClick={() => onChange(applyPreset(value, p))}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <p className="hint">Tap an offering to switch it between off, included and lead.</p>

      {value.categories.map((category) => {
        const items = resolved.filter((i) => i.categoryId === category.id);
        return (
          <div className="category" key={category.id}>
            <div className="category-head">
              <input
                type="color"
                aria-label={`${category.name} colour`}
                value={category.color.toLowerCase()}
                onChange={(e) => onChange(updateCategory(value, category.id, { color: e.target.value.toUpperCase() }))}
              />
              <span className="category-name">{category.name}</span>
              {category.custom && (
                <button
                  type="button"
                  className="link-button"
                  aria-label={`Remove ${category.name}`}
                  onClick={() => onChange(removeCategory(value, category.id))}
                >
                  Remove
                </button>
              )}
            </div>
            {items.map((item) => (
              <div className={`offering state-${item.state}`} key={item.id}>
                <input
                  type="color"
                  aria-label={`${item.name} colour`}
                  value={item.resolvedColor.toLowerCase()}
                  onChange={(e) => onChange(updateOffering(value, item.id, { color: e.target.value.toUpperCase() }))}
                />
                <button
                  type="button"
                  className="offering-name"
                  aria-label={`${item.name}: ${STATE_LABEL[item.state]}. Tap to change.`}
                  onClick={() => onChange(updateOffering(value, item.id, { state: cycleState(item.state) }))}
                >
                  <span className="offering-text">
                    {item.name}
                    {item.short !== item.name && <small>{item.short}</small>}
                  </span>
                  <span
                    className="state-chip"
                    style={
                      item.state === 'lead'
                        ? { background: item.resolvedColor, color: readableOn(item.resolvedColor), borderColor: item.resolvedColor }
                        : item.state === 'included'
                          ? { background: lighten(item.resolvedColor, 0.8), borderColor: item.resolvedColor }
                          : undefined
                    }
                  >
                    {STATE_LABEL[item.state]}
                  </span>
                </button>
                {(item.color || item.custom) && (
                  <div className="offering-actions">
                    {item.color && (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => onChange(updateOffering(value, item.id, { color: null }))}
                      >
                        Reset to category colour
                      </button>
                    )}
                    {item.custom && (
                      <button
                        type="button"
                        className="link-button"
                        aria-label={`Remove ${item.name}`}
                        onClick={() => onChange(removeOffering(value, item.id))}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}

      <Slider
        label="Shade strength"
        value={value.shadeStrength}
        {...LIMITS.shadeStrength}
        onChange={(v) => onChange({ ...value, shadeStrength: v })}
      />
      <Slider label="Colour spread" value={value.spread} {...LIMITS.spread} onChange={(v) => onChange({ ...value, spread: v })} />
      <p className="hint">Nodes and links this many steps from a title shape take its colour. At 0 only the title shape is coloured.</p>

      <AddOffering value={value} onChange={onChange} />
      <AddCategory value={value} onChange={onChange} />
    </>
  );
}

function AddOffering({ value, onChange }: Props) {
  const id = useId();
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [categoryId, setCategoryId] = useState(value.categories[0]?.id ?? '');
  const [color, setColor] = useState<string | null>(null);
  const category = value.categories.find((c) => c.id === categoryId) ?? value.categories[0];
  if (!category) return null;
  // Until a colour is picked, show the shade the new offering would get.
  const count = value.items.filter((i) => i.categoryId === category.id).length;
  const autoColor = shadeFor(category.color, count, count + 1, value.shadeStrength);

  const submit = () => {
    if (!name.trim()) return;
    onChange(addOffering(value, category.id, name, short, color));
    setName('');
    setShort('');
    setColor(null);
  };

  return (
    <details className="add-form">
      <summary>Add offering</summary>
      <div className="add-body">
        <label htmlFor={`${id}-name`}>Name</label>
        <input id={`${id}-name`} type="text" value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor={`${id}-short`}>Short name (optional)</label>
        <input id={`${id}-short`} type="text" value={short} onChange={(e) => setShort(e.target.value)} />
        <label htmlFor={`${id}-cat`}>Category</label>
        <select id={`${id}-cat`} value={category.id} onChange={(e) => setCategoryId(e.target.value)}>
          {value.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-color`}>Colour</label>
        <div className="add-color">
          <input
            id={`${id}-color`}
            type="color"
            value={(color ?? autoColor).toLowerCase()}
            onChange={(e) => setColor(e.target.value.toUpperCase())}
          />
          <span className="hint">{color ? 'Set by hand' : 'Category shade'}</span>
          {color && (
            <button type="button" className="link-button" onClick={() => setColor(null)}>
              Use category shade
            </button>
          )}
        </div>
        <button type="button" className="primary" disabled={!name.trim()} onClick={submit}>
          Add offering
        </button>
      </div>
    </details>
  );
}

function AddCategory({ value, onChange }: Props) {
  const id = useId();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#7A7A7A');
  const submit = () => {
    if (!name.trim()) return;
    onChange(addCategory(value, name, color));
    setName('');
  };
  return (
    <details className="add-form">
      <summary>Add category</summary>
      <div className="add-body">
        <label htmlFor={`${id}-name`}>Name</label>
        <input id={`${id}-name`} type="text" value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor={`${id}-color`}>Colour</label>
        <div className="add-color">
          <input id={`${id}-color`} type="color" value={color.toLowerCase()} onChange={(e) => setColor(e.target.value.toUpperCase())} />
        </div>
        <button type="button" className="primary" disabled={!name.trim()} onClick={submit}>
          Add category
        </button>
      </div>
    </details>
  );
}
