# Node Grid Studio

An internal design tool for the UNICEF Digital Inclusion (DI) offerings visual. It makes a grid of nodes joined
by lines, with the DI offerings placed on it as titles, and exports it as SVG or PNG. It runs fully in the
browser: there is no backend and nothing is sent anywhere. It is not meant to be published.

## Run it

You need Node.js 22.12 or newer (the tests need it; the app itself runs on 20.19 or newer).

```bash
npm install
npm run dev      # opens the tool at http://localhost:5173
npm test         # checks the rules the generator must follow
npm run build    # type check and production build (in dist/)
```

## Use it

The picture is on the left and stays in place. The controls are on the right, in sections you can collapse.
The same settings always give the same picture, so a seed is a design you can come back to.

- **Edit on the picture.** Click a node to hide it (click its faint outline to bring it back). Click the gap
  between two nodes, or a node and a title, to add or remove that link. Drag a node or a title to move it.
  These edits stay when you change the seed. "Clear manual edits" removes them.
- **Undo and redo** cover everything, including offering changes and title moves (buttons, or Ctrl/⌘ + Z).
- **Offerings.** Pick an audience, or tap offerings to switch them between off, included and lead. Titles
  never overlap. If they do not fit, a notice shows the smallest grid that would fit, with a button to apply it.

## Where to edit things

| What | File |
| --- | --- |
| DI brand colours and the colour palettes for each background | `src/brand.ts` |
| The offerings: categories, names, short names, category colours, audience presets | `src/offerings.ts` |
| Slider ranges and default settings | `src/core/settings.ts` |

Keep offering ids in `src/offerings.ts` unchanged once they are in use, because saved setups and links refer
to them. Edit the file, and the app picks the change up on the next reload.

## Saved setups and links

- **Saved setups** (top of the panel): name the current design and save it. It appears as a small thumbnail,
  and clicking it loads that design. Saved setups are kept in this browser only. Clearing the browser's site
  data deletes them.
- **Design links:** the page address always holds the current design (the part after `#d=`). Copy the address,
  or use "Copy link to this design", and anyone who opens it sees the same design. A link only stores what
  differs from the defaults, so it stays short.

## Export

- **Download SVG** and **Copy SVG** (paste straight into Figma). The SVG is plain shapes: no filters, no
  patterns, no transforms. Titles stay as live text (Manrope or Open Sans) so they can be edited in Figma, which
  needs those fonts installed there. The only clip paths are the ones that cut lines and cross-hatch to the
  node shape.
- **Download PNG** at 1x, 2x or 4x. The title fonts are embedded, so text always draws correctly. Very large
  canvases can be too big for 4x; the tool says so instead of failing.
- **Copy settings** copies all settings as JSON. **Reset settings** returns everything to the defaults.
- Canvas: "Fit pattern" sizes the picture to the pattern. 1:1, 16:9, 4:5, A4 or a custom size centre the pattern
  with the outer margin.

## How it is built

React, TypeScript and Vite, with no other large libraries. The idea is simple: `generate(params)` builds a
scene (nodes, links, title shapes), and `render(scene, style)` draws it as SVG. The preview and every export
use that same `render` function.

- `src/core/generate.ts`, `random.ts`, `noise.ts`: the scene, from a seeded random number generator and a
  small noise function.
- `src/core/render.ts`, `geometry.ts`, `joins.ts`, `patterns.ts`: drawing nodes, links, joins and fills.
- `src/core/offerings.ts`, `titles.ts`, `text.ts`: offering colours, title shapes, placement and text sizes.
- `src/core/edits.ts`, `hit.ts`, `share.ts`: hand edits, what a click lands on, and the design code for links.
- `src/ui/` and `src/App.tsx`: the interface.
- `src/core/fontMetrics.ts` is generated from the bundled font files by `scripts/font-metrics.py`
  (needs `pip install fonttools brotli`). You only need to run it if the fonts change.
