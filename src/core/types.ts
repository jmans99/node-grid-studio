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

export type TitleFont = 'Manrope' | 'Open Sans';
export type TitleWeight = 300 | 400 | 500 | 600;
export type TitleAlign = 'left' | 'center' | 'right';
export type TitleTextColor = 'auto' | 'text' | 'offering';
export type MakeRoom = 'remove' | 'push';

/** How offerings appear as title shapes on the grid. */
export interface TitleSettings {
  names: 'short' | 'full';
  /** Wrap long titles of two or more words onto two lines; the shape is then two rows tall. */
  wrap: boolean;
  /** Only titles longer than this many characters are wrapped. */
  wrapAfter: number;
  /** Remove the nodes under a title, or push the grid apart around it. */
  makeRoom: MakeRoom;
  /** Place offerings of the same category near each other. */
  keepCategories: boolean;
  font: TitleFont;
  weight: TitleWeight;
  /** Text size in units. */
  size: number;
  /** Lead titles use larger text: this many times the text size. */
  leadScale: number;
  textColor: TitleTextColor;
  align: TitleAlign;
  /** Space around the text, in units. */
  padding: number;
  /** 0 to 1: how pale the fill of an included title is. */
  includedTint: number;
  /** Draw a thin outline in the offering colour around included titles. */
  includedOutline: boolean;
  /** Titles dragged by hand: top-left grid cell of the title, by offering id. */
  positions: Record<string, { col: number; row: number }>;
}

export interface OfferingsSettings {
  categories: Category[];
  items: Offering[];
  /** 0 to 1: how far offering colours move from their category colour. */
  shadeStrength: number;
  /** 0 to 3: nodes and links this many steps from a title shape take its colour. */
  spread: number;
  /** 0 to 1: how strongly an included offering colours its spread. 1 is the same as lead. */
  includedSpread: number;
  /** In the blue-only background mode, keep offering colours (on) or use shades of UNICEF blue (off). */
  blueModeColors: boolean;
  titles: TitleSettings;
}

/**
 * Changes made by hand on the canvas, kept on top of the generated picture.
 * Nodes are named by grid cell ("col,row"), so edits survive a new seed.
 */
export interface Edits {
  /** Nodes hidden by a click. */
  hidden: string[];
  /** Links added or removed by a click, as "a|b" with the two node ids sorted. */
  linksAdded: string[];
  linksRemoved: string[];
  /** Nodes dragged by hand: how far from their generated spot, in units. */
  moved: Record<string, { dx: number; dy: number }>;
}

export interface Settings {
  params: Params;
  style: Style;
  offerings: OfferingsSettings;
  edits: Edits;
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
  /** Not drawn: hidden by hand, or a title shape sits in its place (where links then aim). */
  hidden?: boolean;
  /** Hidden by hand. The preview shows a faint ghost so it can be clicked back. */
  userHidden?: boolean;
  /** Moved by hand. */
  moved?: boolean;
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
  /** Set when an end attaches to a title shape: the title's id. */
  titleFrom?: string;
  titleTo?: string;
}

/** An offering on the grid: a capsule holding its title. Sizes in units. */
export interface TitleShape {
  /** The offering id. */
  id: string;
  categoryId: string;
  state: Exclude<OfferingState, 'off'>;
  /** The offering colour. */
  color: string;
  /** Fill of the capsule. */
  fill: string;
  /** Outline colour, if drawn. */
  outline?: string;
  /** One or two lines of text. */
  lines: string[];
  font: TitleFont;
  weight: TitleWeight;
  fontSize: number;
  align: TitleAlign;
  textColor: TitleTextColor;
  /** Space between the text and the capsule's side. */
  padX: number;
  /** Centre and half size. */
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
  /** Grid cells it takes: top-left cell and size. */
  col: number;
  row: number;
  cols: number;
  rows: number;
}

/** Whether every active offering found room on the grid. */
export interface TitleFit {
  placed: number;
  total: number;
  /** Smallest grid that fits them all, or null if none up to the largest grid does. */
  suggestion: { columns: number; rows: number } | null;
}

export interface Scene {
  nodes: SceneNode[];
  links: SceneLink[];
  titles: TitleShape[];
  /** Grid spacing, in units. */
  gapX: number;
  gapY: number;
  /** Only set when some titles did not fit. */
  fit?: TitleFit;
}
