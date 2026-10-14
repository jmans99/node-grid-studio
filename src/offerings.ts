/**
 * The DI offerings: categories, offerings and audience presets.
 * This is the one file to edit when the offerings change.
 *
 * Each offering has a full name and, where it is long, a short name.
 * Keep names in sentence case. Ids must be unique and should not change once
 * used, because saved designs and presets refer to them.
 */

export interface OfferingData {
  id: string;
  name: string;
  /** Shorter title. Leave out when the full name is already short. */
  short?: string;
}

export interface CategoryData {
  id: string;
  name: string;
  color: string;
  offerings: OfferingData[];
}

export const CATEGORIES: CategoryData[] = [
  {
    id: 'modelling',
    name: 'Modelling',
    color: '#7E8CFF',
    offerings: [
      { id: 'policy-modelling', name: 'Predictive policy and planning modelling', short: 'Policy modelling' },
      { id: 'infrastructure-modelling', name: 'Infrastructure modelling' },
    ],
  },
  {
    id: 'finance',
    name: 'Finance',
    color: '#22B99A',
    offerings: [
      { id: 'funding-screening', name: 'Funding screening' },
      { id: 'investment-case', name: 'Investment case' },
      { id: 'ifi-engagement', name: 'IFI engagement strategy', short: 'IFI engagement' },
      { id: 'investment-proposal', name: 'Investment proposal' },
    ],
  },
  {
    id: 'business-models',
    name: 'Sustainable business models',
    color: '#A3C93A',
    offerings: [
      { id: 'connectivity-credits', name: 'Connectivity credits' },
      { id: 'x-as-a-hub', name: 'X as a hub' },
    ],
  },
  {
    id: 'network-data',
    name: 'Network and data solutions',
    color: '#00AEEF',
    offerings: [
      { id: 'mapping', name: 'Mapping' },
      { id: 'real-time-monitoring', name: 'Real-time monitoring' },
      { id: 'analytical-dashboards', name: 'Tailored analytical dashboards', short: 'Analytical dashboards' },
    ],
  },
  {
    id: 'ecosystem-readiness',
    name: 'Ecosystem readiness',
    color: '#F2A93B',
    offerings: [
      { id: 'institutional-development', name: 'Institutional development' },
      { id: 'in-country-support', name: 'In-country implementation and support', short: 'In-country support' },
      { id: 'global-convening', name: 'Global convening' },
      { id: 'research', name: 'Research' },
    ],
  },
  {
    id: 'procurement',
    name: 'Procurement',
    color: '#EC6A8C',
    offerings: [
      { id: 'delivery-toolkit', name: 'Delivery solutions toolkit', short: 'Delivery toolkit' },
      { id: 'supported-procurement', name: 'Supported public procurement', short: 'Supported procurement' },
      { id: 'procurement-for-government', name: 'Procurement on behalf of government', short: 'Procurement for government' },
    ],
  },
];

/**
 * How far each offering's colour moves from its category colour. Offerings in
 * a category are spread from darker to lighter, up to this much.
 */
export const SHADE_STRENGTH = 0.45;

export interface AudiencePreset {
  id: string;
  name: string;
  /** Offerings shown as lead. */
  lead: string[];
  /** Offerings shown as included. Every other offering is off. */
  included: string[];
  /** When set, every offering (including ones added later) gets this state. */
  all?: 'included';
}

/** Placeholder audiences with made-up states. Replace with real ones. */
export const AUDIENCE_PRESETS: AudiencePreset[] = [
  {
    id: 'ministry-of-education',
    name: 'Ministry of education',
    lead: ['mapping', 'in-country-support'],
    included: [
      'policy-modelling',
      'infrastructure-modelling',
      'funding-screening',
      'real-time-monitoring',
      'analytical-dashboards',
      'institutional-development',
      'supported-procurement',
    ],
  },
  {
    id: 'development-bank',
    name: 'Development bank',
    lead: ['investment-case', 'investment-proposal'],
    included: [
      'infrastructure-modelling',
      'funding-screening',
      'ifi-engagement',
      'connectivity-credits',
      'mapping',
      'procurement-for-government',
    ],
  },
  {
    id: 'mobile-network-operator',
    name: 'Mobile network operator',
    lead: ['x-as-a-hub'],
    included: ['infrastructure-modelling', 'connectivity-credits', 'mapping', 'real-time-monitoring', 'delivery-toolkit'],
  },
  {
    id: 'ict-regulator',
    name: 'ICT regulator',
    lead: ['policy-modelling'],
    included: [
      'mapping',
      'real-time-monitoring',
      'analytical-dashboards',
      'institutional-development',
      'global-convening',
      'research',
    ],
  },
  {
    id: 'philanthropic-donor',
    name: 'Philanthropic donor',
    lead: ['global-convening', 'research'],
    included: ['funding-screening', 'investment-case', 'connectivity-credits', 'in-country-support'],
  },
  {
    id: 'full-portfolio',
    name: 'Full portfolio',
    lead: [],
    included: [],
    all: 'included',
  },
];
