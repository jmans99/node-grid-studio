import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { emptyEdits, hasEdits } from './core/edits';
import { generate } from './core/generate';
import { fmt, measure, render } from './core/render';
import { CANVAS_PRESETS, DEFAULT_SETTINGS, LIMITS, resolvePalette } from './core/settings';
import type {
  BackgroundMode,
  CanvasPreset,
  CanvasSettings,
  FillPattern,
  JoinStyle,
  LineCap,
  LinePath,
  NodeShape,
  NodeStyle,
  Palette,
  Params,
  Settings,
  Style,
} from './core/types';
import { decodeSettings, encodeSettings } from './core/share';
import { copyText, downloadBlob, downloadText } from './lib/browser';
import { svgToPng } from './lib/png';
import { ColorField } from './ui/ColorField';
import { OfferingsPanel } from './ui/OfferingsPanel';
import { SavedSetups } from './ui/SavedSetups';
import { TitlesPanel } from './ui/TitlesPanel';
import { EditOverlay, useCanvasInteraction } from './ui/useCanvasInteraction';
import { useHistory } from './ui/useHistory';
import { NumberField } from './ui/NumberField';
import { Section } from './ui/Section';
import { Segmented } from './ui/Segmented';
import { Slider } from './ui/Slider';
import { Toggle } from './ui/Toggle';

const SHAPES: { value: NodeShape; label: string }[] = [
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'hexagon', label: 'Hexagon' },
];
const NODE_STYLES: { value: NodeStyle; label: string }[] = [
  { value: 'filled', label: 'Filled' },
  { value: 'outline', label: 'Outline' },
  { value: 'both', label: 'Both' },
];
const FILL_PATTERNS: { value: FillPattern; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'empty', label: 'Empty' },
  { value: 'dots', label: 'Dots' },
  { value: 'lines', label: 'Lines' },
  { value: 'hatch', label: 'Cross-hatch' },
  { value: 'rings', label: 'Rings' },
];
const JOIN_STYLES: { value: JoinStyle; label: string }[] = [
  { value: 'plain', label: 'Plain' },
  { value: 'merged', label: 'Merged' },
  { value: 'smooth', label: 'Smooth' },
];
const LINE_PATHS: { value: LinePath; label: string }[] = [
  { value: 'straight', label: 'Straight' },
  { value: 'elbow', label: 'Elbow' },
  { value: 'curved', label: 'Curved' },
];
const LINE_CAPS: { value: LineCap; label: string }[] = [
  { value: 'round', label: 'Round' },
  { value: 'butt', label: 'Flat' },
];
const BACKGROUNDS: { value: BackgroundMode; label: string }[] = [
  { value: 'paper', label: 'Paper' },
  { value: 'navy', label: 'Navy' },
  { value: 'blue', label: 'Blue only' },
  { value: 'transparent', label: 'Transparent' },
];
const PNG_SCALES = [1, 2, 4] as const;

/** The design in the page address, if there is one. */
const HASH_PREFIX = '#d=';
let startupProblem = '';
function settingsFromAddress(): Settings {
  const hash = window.location.hash;
  if (!hash.startsWith(HASH_PREFIX)) return DEFAULT_SETTINGS;
  const decoded = decodeSettings(hash.slice(HASH_PREFIX.length));
  if (!decoded) startupProblem = 'This link could not be read, so the default design is shown.';
  return decoded ?? DEFAULT_SETTINGS;
}
const linkFor = (s: Settings) => {
  const code = encodeSettings(s);
  return `${window.location.origin}${window.location.pathname}${window.location.search}${code ? HASH_PREFIX + code : ''}`;
};

export default function App() {
  // Every change goes through the history, so it can be undone. Changes with the
  // same key in quick succession (one slider drag, one node drag) are one step.
  const history = useHistory<Settings>(settingsFromAddress);
  const settings = history.value;
  const setSettings = history.update;
  const [pngScale, setPngScale] = useState<(typeof PNG_SCALES)[number]>(2);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<number>(0);
  const { params, style, offerings } = settings;

  // generate() only re-runs when a layout setting changes. render() is the one
  // drawing function, used by the preview and by every export.
  const nodeSize = style.nodeSize;
  const blueBackground = style.backgroundMode === 'blue';
  const scene = useMemo(
    () => generate(params, offerings, { nodeSize, blueMode: blueBackground, edits: settings.edits }),
    [params, offerings, nodeSize, blueBackground, settings.edits],
  );
  const svg = useMemo(() => render(scene, style), [scene, style]);
  const size = useMemo(() => measure(scene, style), [scene, style]);
  const { palette, transparent } = resolvePalette(style);

  const setParam = <K extends keyof Params>(key: K, value: Params[K]) =>
    setSettings((s) => ({ ...s, params: { ...s.params, [key]: value } }), `params:${key}`);
  const setStyle = <K extends keyof Style>(key: K, value: Style[K]) =>
    setSettings((s) => ({ ...s, style: { ...s.style, [key]: value } }), `style:${key}`);
  const setCanvas = (patch: Partial<CanvasSettings>) =>
    setSettings((s) => ({ ...s, style: { ...s.style, canvas: { ...s.style.canvas, ...patch } } }), `canvas:${Object.keys(patch).join()}`);
  const setColor = (key: keyof Palette, hex: string) =>
    setSettings((s) => {
      const mode = s.style.backgroundMode;
      if (mode === 'blue') return s;
      const palettes = { ...s.style.palettes, [mode]: { ...s.style.palettes[mode], [key]: hex } };
      return { ...s, style: { ...s.style, palettes } };
    }, `color:${key}`);

  const choosePreset = (id: CanvasPreset) => {
    const preset = CANVAS_PRESETS.find((p) => p.id === id)!;
    if (preset.width && preset.height) setCanvas({ preset: id, width: preset.width, height: preset.height });
    // Leaving "fit" for "custom" keeps the size you were just looking at.
    else if (id === 'custom' && style.canvas.preset === 'fit')
      setCanvas({ preset: 'custom', width: Math.round(size.width), height: Math.round(size.height) });
    else setCanvas({ preset: id });
  };

  const say = useCallback((message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 2600);
  }, []);
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);
  useEffect(() => {
    if (startupProblem) say(startupProblem);
  }, [say]);

  // Keep the design in the page address, so the link reopens it.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const code = encodeSettings(settings);
      const url = `${window.location.pathname}${window.location.search}${code ? HASH_PREFIX + code : ''}`;
      if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        window.history.replaceState(null, '', url);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [settings]);

  // A pasted link in the same tab loads that design (and can be undone).
  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash;
      if (!hash.startsWith(HASH_PREFIX) || hash.slice(HASH_PREFIX.length) === encodeSettings(history.value)) return;
      const decoded = decodeSettings(hash.slice(HASH_PREFIX.length));
      if (decoded) setSettings(() => decoded);
      else say('This link could not be read.');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [history.value, setSettings, say]);

  // Undo and redo from the keyboard, except while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input[type="text"], input[type="number"], textarea, select')) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        history.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history.undo, history.redo]);

  const copy = async (text: string, done: string) => say((await copyText(text)) ? done : 'Copy failed');
  const downloadPng = async () => {
    try {
      const blob = await svgToPng(svg, size.width, size.height, pngScale);
      downloadBlob(`node-grid-seed-${params.seed}@${pngScale}x.png`, blob);
    } catch (e) {
      say(e instanceof Error ? e.message : 'PNG export failed');
    }
  };

  const blueMode = style.backgroundMode === 'blue';
  const canvas = useCanvasInteraction(scene, size, settings, setSettings);
  const edits = settings.edits;
  const editCount =
    edits.hidden.length + edits.linksAdded.length + edits.linksRemoved.length + Object.keys(edits.moved).length;
  const titlesMoved = Object.keys(offerings.titles.positions).length > 0;
  const suggestion = scene.fit?.suggestion;
  const fit = style.canvas.preset === 'fit';
  const hasOutline = style.nodeStyle !== 'filled';
  const plainJoin = style.joinStyle === 'plain';
  const hasPattern = style.fillPattern !== 'solid';
  const markedPattern = hasPattern && style.fillPattern !== 'empty';
  const linePattern = style.fillPattern === 'lines' || style.fillPattern === 'hatch';
  const stageVars = { '--ratio': size.width / size.height, cursor: canvas.cursor } as CSSProperties;

  return (
    <div className="app">
      <main className="preview-pane">
        <div className="stage">
          <div className={`artboard${transparent ? ' transparent' : ''}`} style={stageVars} {...canvas.handlers}>
            <div className="artboard-svg" dangerouslySetInnerHTML={{ __html: svg }} />
            <EditOverlay scene={scene} size={size} nodeSize={style.nodeSize} hover={canvas.hover} />
          </div>
        </div>
        {scene.fit && (
          <div className="fit-notice" role="status">
            <span>
              {scene.fit.placed} of {scene.fit.total} titles fit on this grid.{' '}
              {suggestion
                ? `Make the grid ${suggestion.columns} × ${suggestion.rows} to fit them all.`
                : 'Even the largest grid (25 × 20) is too small. Try short names, smaller text or fewer offerings.'}
            </span>
            {suggestion && (
              <button
                className="primary"
                onClick={() =>
                  setSettings((s) => ({
                    ...s,
                    params: { ...s.params, columns: suggestion.columns, rows: suggestion.rows },
                  }))
                }
              >
                Use {suggestion.columns} × {suggestion.rows}
              </button>
            )}
          </div>
        )}
        <div className="toolbar">
          <div className="toolbar-actions">
            <span className="button-group">
              <button onClick={history.undo} disabled={!history.canUndo} title="Undo (Ctrl or ⌘ + Z)">
                Undo
              </button>
              <button onClick={history.redo} disabled={!history.canRedo} title="Redo (Ctrl or ⌘ + Shift + Z)">
                Redo
              </button>
            </span>
            <button
              className="primary"
              onClick={() => downloadText(`node-grid-seed-${params.seed}.svg`, svg, 'image/svg+xml')}
            >
              Download SVG
            </button>
            <button onClick={() => copy(svg, 'SVG copied. Paste it into Figma.')}>Copy SVG</button>
            <span className="button-group">
              <button onClick={downloadPng}>Download PNG</button>
              <span className="mini-segmented" role="radiogroup" aria-label="PNG size">
                {PNG_SCALES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={s === pngScale}
                    className={s === pngScale ? 'on' : ''}
                    onClick={() => setPngScale(s)}
                  >
                    {s}x
                  </button>
                ))}
              </span>
            </span>
            <button onClick={() => copy(JSON.stringify(settings, null, 2), 'Settings copied')}>Copy settings</button>
            <button onClick={() => setSettings(() => DEFAULT_SETTINGS)}>Reset settings</button>
          </div>
          <div className="toolbar-info" aria-live="polite">
            {notice || `${scene.nodes.filter((n) => !n.hidden).length} nodes · ${scene.titles.length ? `${scene.titles.length} titles · ` : ''} ${scene.links.length} links · ${fmt(size.width)} × ${fmt(size.height)}`}
          </div>
        </div>
      </main>

      <aside className="panel">
        <header className="panel-head">
          <h1>Node Grid Studio</h1>
          <p>DI offerings visual</p>
        </header>

        <Section title="Saved setups">
          <SavedSetups settings={settings} svg={svg} size={size} onLoad={(s) => setSettings(() => s)} say={say} />
          <button type="button" onClick={() => copy(linkFor(settings), 'Link copied. It opens this exact design.')}>
            Copy link to this design
          </button>
        </Section>

        <Section title="Offerings">
          <OfferingsPanel value={offerings} onChange={(o, key) => setSettings((s) => ({ ...s, offerings: o }), key)} />
        </Section>

        <Section title="Titles">
          <TitlesPanel
            value={offerings.titles}
            onChange={(t, key) => setSettings((s) => ({ ...s, offerings: { ...s.offerings, titles: t } }), key)}
          />
        </Section>

        <Section title="Edit on canvas">
          <ul className="hint-list">
            <li>Click a node to hide it. Click its faint outline to show it again.</li>
            <li>Click the gap between two nodes, or a node and a title, to add or remove that link.</li>
            <li>Drag a node or a title to move it.</li>
          </ul>
          <p className="hint">
            {editCount
              ? [
                  edits.hidden.length && `${edits.hidden.length} hidden`,
                  edits.linksAdded.length && `${edits.linksAdded.length} links added`,
                  edits.linksRemoved.length && `${edits.linksRemoved.length} links removed`,
                  Object.keys(edits.moved).length && `${Object.keys(edits.moved).length} moved`,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : 'No edits yet.'}{' '}
            Edits stay when you change the seed.
          </p>
          <button
            type="button"
            disabled={!hasEdits(edits) && !titlesMoved}
            onClick={() =>
              setSettings((s) => ({
                ...s,
                edits: emptyEdits(),
                offerings: { ...s.offerings, titles: { ...s.offerings.titles, positions: {} } },
              }))
            }
          >
            Clear manual edits
          </button>
        </Section>

        <Section title="Nodes">
          <Slider label="Node size" value={style.nodeSize} {...LIMITS.nodeSize} onChange={(v) => setStyle('nodeSize', v)} />
          <Segmented label="Node shape" value={style.nodeShape} options={SHAPES} onChange={(v) => setStyle('nodeShape', v)} />
          {style.nodeShape === 'rounded' && (
            <Slider
              label="Corner radius"
              value={style.cornerRadius}
              {...LIMITS.cornerRadius}
              onChange={(v) => setStyle('cornerRadius', v)}
            />
          )}
          <Segmented label="Node style" value={style.nodeStyle} options={NODE_STYLES} onChange={(v) => setStyle('nodeStyle', v)} />
          {hasOutline && (
            <Slider
              label="Outline thickness"
              value={style.outlineWidth}
              {...LIMITS.outlineWidth}
              onChange={(v) => setStyle('outlineWidth', v)}
            />
          )}
        </Section>

        <Section title="Fill">
          <Segmented label="Fill pattern" value={style.fillPattern} options={FILL_PATTERNS} onChange={(v) => setStyle('fillPattern', v)} />
          {style.nodeStyle === 'outline' && hasPattern && (
            <p className="hint">Outline-only nodes have no fill. Set node style to filled or both to see the pattern.</p>
          )}
          {markedPattern && (
            <>
              <Slider
                label="Pattern density"
                value={style.patternDensity}
                {...LIMITS.patternDensity}
                onChange={(v) => setStyle('patternDensity', v)}
              />
              <Slider
                label={style.fillPattern === 'dots' ? 'Dot size' : 'Line size'}
                value={style.patternSize}
                {...LIMITS.patternSize}
                onChange={(v) => setStyle('patternSize', v)}
              />
            </>
          )}
          {linePattern && (
            <Slider
              label="Angle"
              value={style.patternAngle}
              {...LIMITS.patternAngle}
              unit="°"
              onChange={(v) => setStyle('patternAngle', v)}
            />
          )}
          {hasPattern && (
            <Slider
              label="Nodes with pattern"
              value={style.patternMix}
              {...LIMITS.patternMix}
              unit="%"
              onChange={(v) => setStyle('patternMix', v)}
            />
          )}
          {hasPattern && style.patternMix < 100 && <p className="hint">The other nodes stay solid.</p>}
        </Section>

        <Section title="Connections">
          <Slider
            label="Connection density"
            value={params.density}
            {...LIMITS.density}
            onChange={(v) => setParam('density', v)}
          />
          <Segmented label="Line path" value={style.linePath} options={LINE_PATHS} onChange={(v) => setStyle('linePath', v)} />
          {style.linePath === 'elbow' && (
            <Slider
              label="Line radius"
              value={style.lineRadius}
              {...LIMITS.lineRadius}
              onChange={(v) => setStyle('lineRadius', v)}
            />
          )}
          {plainJoin ? (
            <>
              <Slider
                label="Line thickness"
                value={style.lineWidth}
                {...LIMITS.lineWidth}
                onChange={(v) => setStyle('lineWidth', v)}
              />
              <Segmented label="Line cap" value={style.lineCap} options={LINE_CAPS} onChange={(v) => setStyle('lineCap', v)} />
              <Toggle label="Dashed lines" checked={style.dashed} onChange={(v) => setStyle('dashed', v)} />
              {style.dashed && (
                <>
                  <Slider
                    label="Dash length"
                    value={style.dashLength}
                    {...LIMITS.dashLength}
                    onChange={(v) => setStyle('dashLength', v)}
                  />
                  <Slider label="Dash gap" value={style.dashGap} {...LIMITS.dashGap} onChange={(v) => setStyle('dashGap', v)} />
                </>
              )}
            </>
          ) : (
            <p className="hint">With merged and smooth joins, links are bars in the node colour. Set their width under joins.</p>
          )}
        </Section>

        <Section title="Joins">
          <Segmented label="Join style" value={style.joinStyle} options={JOIN_STYLES} onChange={(v) => setStyle('joinStyle', v)} />
          {!plainJoin && (
            <Slider label="Bar width" value={style.barWidth} {...LIMITS.barWidth} onChange={(v) => setStyle('barWidth', v)} />
          )}
          {style.joinStyle === 'smooth' && (
            <Slider
              label="Smoothness"
              value={style.smoothness}
              {...LIMITS.smoothness}
              onChange={(v) => setStyle('smoothness', v)}
            />
          )}
        </Section>

        <Section title="Grid">
          <Slider label="Columns" value={params.columns} {...LIMITS.columns} onChange={(v) => setParam('columns', v)} />
          <Slider label="Rows" value={params.rows} {...LIMITS.rows} onChange={(v) => setParam('rows', v)} />
          <Slider
            label="Displacement"
            value={params.displacement}
            {...LIMITS.displacement}
            onChange={(v) => setParam('displacement', v)}
          />
        </Section>

        <Section title="Spacing">
          <Slider label="Horizontal gap" value={params.gapX} {...LIMITS.gapX} onChange={(v) => setParam('gapX', v)} />
          <Slider label="Vertical gap" value={params.gapY} {...LIMITS.gapY} onChange={(v) => setParam('gapY', v)} />
          <Slider
            label="Outer margin"
            value={style.canvas.margin}
            {...LIMITS.margin}
            onChange={(v) => setCanvas({ margin: v })}
          />
        </Section>

        <Section title="Colour">
          <Segmented
            label="Background"
            value={style.backgroundMode}
            options={BACKGROUNDS}
            onChange={(v) => setStyle('backgroundMode', v)}
          />
          {blueMode && <p className="hint">Every colour is a shade of UNICEF blue.</p>}
          {style.backgroundMode === 'transparent' && <p className="hint">No background is drawn.</p>}
          <ColorField label="Node colour" value={palette.node} disabled={blueMode} onChange={(v) => setColor('node', v)} />
          <ColorField label="Line colour" value={palette.line} disabled={blueMode} onChange={(v) => setColor('line', v)} />
          <ColorField
            label="Background colour"
            value={palette.background}
            disabled={blueMode || transparent}
            onChange={(v) => setColor('background', v)}
          />
          <ColorField label="Text colour" value={palette.text} disabled={blueMode} onChange={(v) => setColor('text', v)} />
          {style.nodeStyle === 'both' && (
            <ColorField label="Outline colour" value={palette.outline} disabled={blueMode} onChange={(v) => setColor('outline', v)} />
          )}
          {!blueMode && <p className="hint">Each background keeps its own colours.</p>}
        </Section>

        <Section title="Canvas">
          <Segmented
            label="Size"
            value={style.canvas.preset}
            options={CANVAS_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
            onChange={choosePreset}
          />
          <div className="pair">
            <NumberField
              label="Width (px)"
              value={fit ? size.width : style.canvas.width}
              {...{ min: LIMITS.canvasSize.min, max: LIMITS.canvasSize.max }}
              disabled={fit}
              onChange={(v) => setCanvas({ preset: 'custom', width: v })}
            />
            <NumberField
              label="Height (px)"
              value={fit ? size.height : style.canvas.height}
              {...{ min: LIMITS.canvasSize.min, max: LIMITS.canvasSize.max }}
              disabled={fit}
              onChange={(v) => setCanvas({ preset: 'custom', height: v })}
            />
          </div>
          {fit && <p className="hint">The canvas follows the pattern. Pick a size to centre the pattern on a fixed canvas.</p>}
        </Section>

        <Section title="Randomness">
          <Slider label="Seed" value={params.seed} {...LIMITS.seed} onChange={(v) => setParam('seed', v)} />
        </Section>
      </aside>
    </div>
  );
}
