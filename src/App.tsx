import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { generate } from './core/generate';
import { fmt, measure, render } from './core/render';
import { CANVAS_PRESETS, DEFAULT_SETTINGS, LIMITS, resolvePalette } from './core/settings';
import type {
  BackgroundMode,
  CanvasPreset,
  CanvasSettings,
  LineCap,
  LinePath,
  NodeShape,
  NodeStyle,
  Palette,
  Params,
  Settings,
  Style,
} from './core/types';
import { copyText, downloadBlob, downloadText } from './lib/browser';
import { svgToPng } from './lib/png';
import { ColorField } from './ui/ColorField';
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

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [pngScale, setPngScale] = useState<(typeof PNG_SCALES)[number]>(2);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<number>(0);
  const { params, style } = settings;

  // generate() only re-runs when a layout setting changes. render() is the one
  // drawing function, used by the preview and by every export.
  const scene = useMemo(() => generate(params), [params]);
  const svg = useMemo(() => render(scene, style), [scene, style]);
  const size = useMemo(() => measure(scene, style), [scene, style]);
  const { palette, transparent } = resolvePalette(style);

  const setParam = <K extends keyof Params>(key: K, value: Params[K]) =>
    setSettings((s) => ({ ...s, params: { ...s.params, [key]: value } }));
  const setStyle = <K extends keyof Style>(key: K, value: Style[K]) =>
    setSettings((s) => ({ ...s, style: { ...s.style, [key]: value } }));
  const setCanvas = (patch: Partial<CanvasSettings>) =>
    setSettings((s) => ({ ...s, style: { ...s.style, canvas: { ...s.style.canvas, ...patch } } }));
  const setColor = (key: keyof Palette, hex: string) =>
    setSettings((s) => {
      const mode = s.style.backgroundMode;
      if (mode === 'blue') return s;
      const palettes = { ...s.style.palettes, [mode]: { ...s.style.palettes[mode], [key]: hex } };
      return { ...s, style: { ...s.style, palettes } };
    });

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
  const fit = style.canvas.preset === 'fit';
  const hasOutline = style.nodeStyle !== 'filled';
  const stageVars = { '--ratio': size.width / size.height } as CSSProperties;

  return (
    <div className="app">
      <main className="preview-pane">
        <div className="stage">
          <div
            className={`artboard${transparent ? ' transparent' : ''}`}
            style={stageVars}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
        <div className="toolbar">
          <div className="toolbar-actions">
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
            <button onClick={() => setSettings(DEFAULT_SETTINGS)}>Reset settings</button>
          </div>
          <div className="toolbar-info" aria-live="polite">
            {notice || `${scene.nodes.length} nodes · ${scene.links.length} links · ${fmt(size.width)} × ${fmt(size.height)}`}
          </div>
        </div>
      </main>

      <aside className="panel">
        <header className="panel-head">
          <h1>Node Grid Studio</h1>
          <p>DI offerings visual</p>
        </header>

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
          <Slider
            label="Line thickness"
            value={style.lineWidth}
            {...LIMITS.lineWidth}
            onChange={(v) => setStyle('lineWidth', v)}
          />
          <Segmented label="Line cap" value={style.lineCap} options={LINE_CAPS} onChange={(v) => setStyle('lineCap', v)} />
          <Toggle label="Dashed lines" checked={style.dashed} onChange={(v) => setStyle('dashed', v)} />
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
