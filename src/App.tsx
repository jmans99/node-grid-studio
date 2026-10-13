import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generate } from './core/generate';
import { fmt, measure, render } from './core/render';
import { DEFAULT_SETTINGS, LIMITS } from './core/settings';
import type { Params, Settings, Style } from './core/types';
import { copyText, downloadText } from './lib/browser';
import { Section } from './ui/Section';
import { Slider } from './ui/Slider';

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<number>(0);
  const { params, style } = settings;

  // generate() only re-runs when a layout setting changes. render() is the one
  // drawing function, used by the preview and by every export.
  const scene = useMemo(() => generate(params), [params]);
  const svg = useMemo(() => render(scene, style), [scene, style]);
  const size = useMemo(() => measure(scene, style), [scene, style]);

  const setParam = <K extends keyof Params>(key: K, value: Params[K]) =>
    setSettings((s) => ({ ...s, params: { ...s.params, [key]: value } }));
  const setStyle = <K extends keyof Style>(key: K, value: Style[K]) =>
    setSettings((s) => ({ ...s, style: { ...s.style, [key]: value } }));

  const say = useCallback((message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 2200);
  }, []);
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const copy = async (text: string, done: string) => say((await copyText(text)) ? done : 'Copy failed');

  return (
    <div className="app">
      <main className="preview-pane">
        <div className="stage" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="toolbar">
          <div className="toolbar-actions">
            <button
              className="primary"
              onClick={() => downloadText(`node-grid-seed-${params.seed}.svg`, svg, 'image/svg+xml')}
            >
              Download SVG
            </button>
            <button onClick={() => copy(svg, 'SVG copied. Paste it into Figma.')}>Copy SVG</button>
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
        </Section>

        <Section title="Connections">
          <Slider
            label="Connection density"
            value={params.density}
            {...LIMITS.density}
            onChange={(v) => setParam('density', v)}
          />
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

        <Section title="Randomness">
          <Slider label="Seed" value={params.seed} {...LIMITS.seed} onChange={(v) => setParam('seed', v)} />
        </Section>
      </aside>
    </div>
  );
}
