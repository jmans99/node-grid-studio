import { useEffect, useId, useState } from 'react';
import type { Measure } from '../core/render';
import { decodeSettings, encodeSettings } from '../core/share';
import type { Settings } from '../core/types';
import { svgToPng } from '../lib/png';

interface Saved {
  id: string;
  name: string;
  savedAt: number;
  /** The settings, in the same form as the page address. */
  code: string;
  /** Small PNG preview, as a data URL. */
  thumb: string;
}

const STORAGE_KEY = 'node-grid-studio:saved-setups';

function readSaved(): Saved[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((s) => s && typeof s.code === 'string' && typeof s.name === 'string') : [];
  } catch {
    return [];
  }
}

function writeSaved(list: Saved[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

interface Props {
  settings: Settings;
  svg: string;
  size: Measure;
  onLoad: (s: Settings) => void;
  say: (message: string) => void;
}

/** Named versions kept in this browser, shown as thumbnails. Click one to load it. */
export function SavedSetups({ settings, svg, size, onLoad, say }: Props) {
  const id = useId();
  const [saved, setSaved] = useState<Saved[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setSaved(readSaved()), []);

  const save = async () => {
    setBusy(true);
    try {
      // A small picture, at most 240 px on its longest side.
      const scale = Math.min(1, 240 / Math.max(size.width, size.height));
      const thumb = await blobToDataUrl(await svgToPng(svg, size.width, size.height, scale));
      const entry: Saved = {
        id: `${Date.now()}`,
        name: name.trim() || `Setup ${saved.length + 1}`,
        savedAt: Date.now(),
        code: encodeSettings(settings),
        thumb,
      };
      const next = [entry, ...saved];
      if (writeSaved(next)) {
        setSaved(next);
        setName('');
        say(`Saved “${entry.name}”`);
      } else say('Could not save: browser storage is full or turned off');
    } catch {
      say('Could not save this setup');
    } finally {
      setBusy(false);
    }
  };

  const load = (s: Saved) => {
    const decoded = decodeSettings(s.code);
    if (decoded) {
      onLoad(decoded);
      say(`Loaded “${s.name}”`);
    } else say('That saved setup could not be read');
  };

  const remove = (s: Saved) => {
    const next = saved.filter((x) => x.id !== s.id);
    if (writeSaved(next)) setSaved(next);
  };

  return (
    <>
      <div className="save-row">
        <label htmlFor={id} className="visually-hidden">
          Name for this setup
        </label>
        <input
          id={id}
          type="text"
          placeholder={`Setup ${saved.length + 1}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && save()}
        />
        <button type="button" className="primary" disabled={busy} onClick={save}>
          Save setup
        </button>
      </div>
      {saved.length ? (
        <div className="saved-grid">
          {saved.map((s) => (
            <div className="saved" key={s.id}>
              <button type="button" className="saved-thumb" onClick={() => load(s)} title={`Load “${s.name}”`}>
                <img src={s.thumb} alt="" />
                <span>{s.name}</span>
              </button>
              <button type="button" className="link-button" aria-label={`Delete ${s.name}`} onClick={() => remove(s)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="hint">Saved setups stay in this browser. The page address also holds the current design, so a link reopens it.</p>
      )}
    </>
  );
}
