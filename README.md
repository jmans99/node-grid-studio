# Node Grid Studio

An internal design tool that makes a grid of nodes joined by lines, as SVG, for the
UNICEF Digital Inclusion (DI) offerings visual. Everything runs in the browser.

> Work in progress. Phases 1 to 5 are done (base generator; colour, style, canvas, export; node fills and joins;
> offerings and title shapes; click to edit and saving). A full README comes at the end.

## Run it

```bash
npm install
npm run dev      # opens http://localhost:5173
npm test         # checks the generator rules
npm run build    # type check and production build
```

## How it is built

- `src/core/generate.ts`: `generate(params)` returns a scene (nodes, links, title shapes).
- `src/core/render.ts`: `render(scene, style)` returns the SVG string. The preview and
  every export use this one function.
- `src/core/random.ts`, `src/core/noise.ts`: seeded random (mulberry32) and a small value-noise
  function. The same settings always give the same picture.
- `src/core/geometry.ts`: node shapes and link paths (straight, elbow, curved), including cutting lines at the node edge.
- `src/core/patterns.ts`: fill patterns inside nodes (dots, lines, cross-hatch, rings).
- `src/core/joins.ts`: merged and smooth joins, built from tangent arcs (no blur).
- `src/core/settings.ts`: slider ranges, canvas presets and default settings.
- `src/offerings.ts`: the offerings data: categories, offerings (full and short names), category colours,
  shade strength and audience presets. Edit offerings here.
- `src/core/offerings.ts`, `src/core/titles.ts`: offering colours, title sizing and placement, making room
  (remove or push apart), and colour spread.
- `src/core/text.ts`, `src/core/fontMetrics.ts`: title text measuring. `fontMetrics.ts` is generated from the
  bundled Manrope and Open Sans files by `scripts/font-metrics.py` (needs `pip install fonttools brotli`).
- `src/lib/fonts.ts`: loads the title fonts in the app and embeds them in PNG exports. SVG exports keep plain,
  editable text.
- `src/core/edits.ts`, `src/core/hit.ts`: hand edits on the canvas (hidden nodes, added or removed links, moved
  nodes), and what a click lands on.
- `src/core/share.ts`: the design as a short code in the page address (`#d=...`), used for links and saved setups.
- `src/brand.ts`: the DI brand colours and the default colour palettes. Edit brand colours here.
