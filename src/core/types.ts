/** Settings that change the layout. Changing any of these re-runs generate(). */
export interface Params {
  columns: number;
  rows: number;
  /** 0 to 1: share of the possible links that are drawn. */
  density: number;
  /** Largest distance, in units, a node can move from its grid position. */
  displacement: number;
  seed: number;
}

/** Settings that only change how a scene is drawn. */
export interface Style {
  /** Node radius in units. */
  nodeSize: number;
  nodeColor: string;
  lineColor: string;
  backgroundColor: string;
  /** Line thickness in units. */
  lineWidth: number;
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
