# Node Grid Studio

An internal design tool that makes a grid of nodes joined by lines, as SVG, for the
UNICEF Digital Inclusion (DI) offerings visual. Everything runs in the browser.

> Work in progress. Phases 1 to 3 (base generator; colour, style, canvas, export; node fills and joins) are done. A full README comes at the end.

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
- `src/brand.ts`: the DI brand colours and the default colour palettes. Edit brand colours here.
