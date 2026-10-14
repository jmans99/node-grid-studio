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
export type FillPattern = 'solid' | 'empty' | 'dots' | 'lines' | 'hatch' | 'rings';
export type JoinStyle = 'plain' | 'merged' | 'smooth';
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
  /** Dash and gap length in units. Each link adjusts them slightly so it starts and ends on a dash. */
  dashLength: number;
  dashGap: number;
  linePath: LinePath;
  /** Rounds the bends of elbow lines, in units. */
  lineRadius: number;

  /** What fills the inside of a node. Applies when the node style is filled or both. */
  fillPattern: FillPattern;
  /** 0 to 1: how close together the pattern marks are. */
  patternDensity: number;
  /** Pattern line thickness or dot width, in units. */
  patternSize: number;
  /** Pattern line angle in degrees. */
  patternAngle: number;
  /** 0 to 100: share of nodes that use the pattern. The rest stay solid. */
  patternMix: number;

  /** How a link meets a node. */
  joinStyle: JoinStyle;
  /** Bar width for merged and smooth joins, in units. */
  barWidth: number;
  /** 0 to 1: how far a smooth join flares into the node. */
  smoothness: number;

  backgroundMode: BackgroundMode;
  palettes: Record<EditableMode, Palette>;
  canvas: CanvasSettings;
}

export type OfferingState = 'off' | 'included' | 'lead';

export interface Category {
  id: string;
  name: string;
  color: string;
  /** Added in the app rather than in the data file. */
  custom?: boolean;
}

export interface Offering {
  id: string;
  categoryId: string;
  name: string;
  short: string;
  state: OfferingState;
  /** A colour set by hand, or null to use the category shade. */
  color: string | null;
  /** Added in the app rather than in the data file. */
  custom?: boolean;
}

export interface OfferingsSettings {
  categories: Category[];
  items: Offering[];
  /** 0 to 1: how far offering colours move from their category colour. */
  shadeStrength: number;
  /** 0 to 3: nodes and links this many steps from a title shape take its colour. */
  spread: number;
}

export interface Settings {
  params: Params;
  style: Style;
  offerings: OfferingsSettings;
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
  /** This node's own seed, for patterns like scattered dots. */
  seed: number;
  /** 0 to 1, fixed per node. Picks which nodes get the pattern when only some do. */
  pick: number;
  /** Offering colour, when the node is near a title shape. */
  color?: string;
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
  /** Offering colour, when the link is near a title shape. */
  color?: string;
}

/** An offering on the grid. For now a simple placeholder that sits on one node. */
export interface TitleShape {
  /** The offering id. */
  id: string;
  /** The node it replaces. */
  nodeId: string;
  state: Exclude<OfferingState, 'off'>;
  color: string;
  text: string;
  /** Centre, in units. */
  x: number;
  y: number;
}

export interface Scene {
  nodes: SceneNode[];
  links: SceneLink[];
  titles: TitleShape[];
  /** Grid spacing, in units. */
  gapX: number;
  gapY: number;
}
