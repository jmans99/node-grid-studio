/** Settings that change the layout. Changing any of these re-runs generate(). */
export interface Params {
  columns: number;
  rows: number;
  /** 0 to 1: share of the possible links that are drawn. */
  density: number;
  /** Largest distance, in units, a node can move from its grid position. */
  displacement: number;
  seed: number;
  /** Distance between node centres, sideways and up/down, in units. */
  gapX: number;
  gapY: number;
}

export type NodeShape = 'circle' | 'square' | 'rounded' | 'diamond' | 'hexagon';
export type NodeStyle = 'filled' | 'outline' | 'both';
export type LinePath = 'straight' | 'elbow' | 'curved';
export type LineCap = 'round' | 'butt';
export type BackgroundMode = 'paper' | 'navy' | 'blue' | 'transparent';
/** Modes whose colours the user can edit. Blue only is always derived. */
export type EditableMode = Exclude<BackgroundMode, 'blue'>;
export type CanvasPreset = 'fit' | '1:1' | '16:9' | '4:5' | 'a4' | 'custom';

export interface Palette {
  background: string;
  node: string;
  line: string;
  text: string;
  /** Outline colour when the node style is "both". */
  outline: string;
}

export interface CanvasSettings {
  preset: CanvasPreset;
  /** Canvas size in px. In "fit" mode the size follows the pattern instead. */
  width: number;
  height: number;
  /** Space between the pattern and the canvas edge, in px. */
  margin: number;
}

/** Settings that only change how a scene is drawn. */
export interface Style {
  /** Node radius in units (half the width of the node). */
  nodeSize: number;
  nodeShape: NodeShape;
  /** Corner radius of the rounded square, in units. */
  cornerRadius: number;
  nodeStyle: NodeStyle;
  /** Outline thickness in units. */
  outlineWidth: number;

  /** Line thickness in units. */
  lineWidth: number;
  lineCap: LineCap;
  dashed: boolean;
  linePath: LinePath;
  /** Rounds the bends of elbow lines, in units. */
  lineRadius: number;

  backgroundMode: BackgroundMode;
  palettes: Record<EditableMode, Palette>;
  canvas: CanvasSettings;
}

export interface Settings {
  params: Params;
  style: Style;
}

export interface SceneNode {
  id: string;
  col: number;
  row: number;
  /** Position on the plain grid. */
  gx: number;
  gy: number;
  /** Final position, after displacement. */
  x: number;
  y: number;
}

export interface SceneLink {
  id: string;
  /** Node ids. */
  from: string;
  to: string;
  /** h = sideways, v = up/down, d = diagonal. */
  kind: 'h' | 'v' | 'd';
  /** For elbow and curved lines: which way the line leaves the first node. */
  bend: 'h' | 'v';
}

/** Placeholder for the offering title shapes added in phase 4. */
export interface TitleShape {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

export interface Scene {
  nodes: SceneNode[];
  links: SceneLink[];
  titles: TitleShape[];
}
