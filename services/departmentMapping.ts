export type IssueType =
  | 'Pothole'
  | 'Damaged Road'
  | 'alligator cracking'
  | 'cracking'
  | 'pothole'
  | 'Garbage Overflow'
  | 'Solid Waste Issue'
  | 'Garbage Bin Problem'
  | 'Uncollected Waste'
  | 'Drainage Problem'
  | 'Drainage Blockage'
  | 'Stormwater Issue'
  | 'Waterlogging'
  | 'Damaged Infrastructure'
  | 'Other';

export type Severity = 'Low' | 'Medium' | 'High' | 'Critical';

export interface DepartmentInfo {
  name: string;
  code: string;
}

export const ISSUE_DEPARTMENT_MAP: Record<string, DepartmentInfo> = {
  // 10 Approved Core AI Classes
  'alligator cracking':      { name: 'Road Maintenance', code: 'ROAD' },
  'cracking':                { name: 'Road Maintenance', code: 'ROAD' },
  'pothole':                 { name: 'Road Maintenance', code: 'ROAD' },
  'manhole defect':          { name: 'Stormwater / Drainage', code: 'DRAIN' },
  'waterlogging':            { name: 'Stormwater / Drainage', code: 'DRAIN' },
  'road divider damage':     { name: 'Traffic / Road Safety Department', code: 'SAFETY' },
  'damaged traffic sign':    { name: 'Traffic / Road Safety Department', code: 'SAFETY' },
  'street light fault':      { name: 'Street Lighting Department', code: 'LIGHTING' },
  'debris / road blockage':  { name: 'Solid Waste Management', code: 'SWM' },
  'damaged footpath':        { name: 'Public Works Department', code: 'PWD' },

  // General & Legacy Variations
  'Pothole':                 { name: 'Road Maintenance', code: 'ROAD' },
  'Damaged Road':            { name: 'Road Maintenance', code: 'ROAD' },
  'Road Issue':              { name: 'Road Maintenance', code: 'ROAD' },
  'Garbage Overflow':        { name: 'Solid Waste Management', code: 'SWM' },
  'Solid Waste Issue':       { name: 'Solid Waste Management', code: 'SWM' },
  'Garbage Bin Problem':     { name: 'Solid Waste Management', code: 'SWM' },
  'Uncollected Waste':       { name: 'Solid Waste Management', code: 'SWM' },
  'Drainage Problem':        { name: 'Stormwater / Drainage', code: 'DRAIN' },
  'Drainage Blockage':       { name: 'Stormwater / Drainage', code: 'DRAIN' },
  'Stormwater Issue':        { name: 'Stormwater / Drainage', code: 'DRAIN' },
  'Waterlogging':            { name: 'Stormwater / Drainage', code: 'DRAIN' },
  'Sewerage Issue':          { name: 'Sewerage', code: 'SEWER' },
  'Sewage Overflow':         { name: 'Sewerage', code: 'SEWER' },
  'Sewer Blockage':          { name: 'Sewerage', code: 'SEWER' },
  'Sewage Leakage':          { name: 'Sewerage', code: 'SEWER' },
  'Building Damage':         { name: 'Public Building Maintenance', code: 'BUILDING' },
  'Building Repair':         { name: 'Public Building Maintenance', code: 'BUILDING' },
  'Wall Damage':             { name: 'Public Building Maintenance', code: 'BUILDING' },
  'Roof Leakage':            { name: 'Public Building Maintenance', code: 'BUILDING' },
  'Ceiling Damage':          { name: 'Public Building Maintenance', code: 'BUILDING' },
  'Door Damage':             { name: 'Public Building Maintenance', code: 'BUILDING' },
  'Window Damage':           { name: 'Public Building Maintenance', code: 'BUILDING' },
  'Floor Damage':            { name: 'Public Building Maintenance', code: 'BUILDING' },
  'Park Maintenance':        { name: 'Parks and Public Spaces', code: 'PARKS' },
  'Playground Damage':       { name: 'Parks and Public Spaces', code: 'PARKS' },
  'Park Damage':             { name: 'Parks and Public Spaces', code: 'PARKS' },
  'Park Issue':              { name: 'Parks and Public Spaces', code: 'PARKS' },
  'Tree Maintenance':        { name: 'Tree / Greenery Maintenance', code: 'TREES' },
  'Fallen Tree':             { name: 'Tree / Greenery Maintenance', code: 'TREES' },
  'Tree / Greenery Issue':   { name: 'Tree / Greenery Maintenance', code: 'TREES' },
  'Overgrown Vegetation':    { name: 'Tree / Greenery Maintenance', code: 'TREES' },
  'Damaged Infrastructure':  { name: 'Road Maintenance', code: 'ROAD' },
  'Public Route Issue':      { name: 'Public Works Department', code: 'PWD' },
  'Damaged Footpath':        { name: 'Public Works Department', code: 'PWD' },
  'Public Works Defect':     { name: 'Public Works Department', code: 'PWD' },
  'Public Corridor Defect':  { name: 'Public Works Department', code: 'PWD' },
  'missing signage':         { name: 'Traffic / Road Safety Department', code: 'SAFETY' },
  'Road Divider Issue':      { name: 'Traffic / Road Safety Department', code: 'SAFETY' },
  'Signage / Signal Fault':  { name: 'Traffic / Road Safety Department', code: 'SAFETY' },
  'Street Light Fault':      { name: 'Street Lighting Department', code: 'LIGHTING' },
  'Street Light Defect':     { name: 'Street Lighting Department', code: 'LIGHTING' },
  'Other':                   { name: 'Road Maintenance', code: 'ROAD' },
};

export const ALL_ISSUE_TYPES: string[] = Object.keys(ISSUE_DEPARTMENT_MAP);

export function getDepartmentForIssue(issue: string): DepartmentInfo {
  return ISSUE_DEPARTMENT_MAP[issue] ?? { name: 'Road Maintenance', code: 'ROAD' };
}


/**
 * Returns the proper issue type for non-road departments based on department code and matched keyword.
 * Prevents road ML classifier labels (e.g. "alligator cracking") from polluting non-road complaints.
 */
export function getDefaultIssueTypeForDepartment(deptCode: string, matchedKeyword?: string): string {
  const code = (deptCode || '').toUpperCase().trim();
  const kw = (matchedKeyword || '').toLowerCase().trim();

  switch (code) {
    case 'TREES':
      if (kw.includes('fallen') || kw.includes('uproot')) return 'Fallen Tree';
      if (kw.includes('trim') || kw.includes('prun') || kw.includes('cut') || kw.includes('maintenance')) return 'Tree Maintenance';
      if (kw.includes('vegetation') || kw.includes('bush') || kw.includes('shrub') || kw.includes('hedge') || kw.includes('overgrown') || kw.includes('grass')) return 'Overgrown Vegetation';
      return 'Tree / Greenery Issue';
    case 'SWM':
      if (kw.includes('bin') || kw.includes('dustbin')) return 'Garbage Bin Problem';
      if (kw.includes('uncollected') || kw.includes('dump')) return 'Uncollected Waste';
      return 'Garbage Overflow';
    case 'DRAIN':
      if (kw.includes('block') || kw.includes('clog')) return 'Drainage Blockage';
      if (kw.includes('waterlog') || kw.includes('flood') || kw.includes('stagnan')) return 'Waterlogging';
      if (kw.includes('storm')) return 'Stormwater Issue';
      return 'Drainage Problem';
    case 'SEWER':
      if (kw.includes('overflow')) return 'Sewage Overflow';
      if (kw.includes('block') || kw.includes('clog')) return 'Sewer Blockage';
      if (kw.includes('leak')) return 'Sewage Leakage';
      return 'Sewerage Issue';
    case 'BUILDING':
      if (kw.includes('wall')) return 'Wall Damage';
      if (kw.includes('roof')) return 'Roof Leakage';
      if (kw.includes('ceiling')) return 'Ceiling Damage';
      if (kw.includes('door')) return 'Door Damage';
      if (kw.includes('window')) return 'Window Damage';
      if (kw.includes('floor')) return 'Floor Damage';
      if (kw.includes('repair')) return 'Building Repair';
      return 'Building Damage';
    case 'PARKS':
      if (kw.includes('playground') || kw.includes('swing') || kw.includes('slide')) return 'Playground Damage';
      if (kw.includes('maintenance') || kw.includes('clean')) return 'Park Maintenance';
      if (kw.includes('bench') || kw.includes('fence') || kw.includes('gate') || kw.includes('damage') || kw.includes('broken')) return 'Park Damage';
      return 'Park Issue';
    case 'ROAD':
    default:
      return 'Road Issue';
  }
}

export function getDepartmentCode(deptNameOrCode: string): string {
  const norm = (deptNameOrCode || '').trim().toLowerCase();
  for (const config of Object.values(DEPARTMENTS_CONFIG)) {
    if (config.name.toLowerCase() === norm || config.code.toLowerCase() === norm) {
      return config.code;
    }
  }
  if (norm.includes('solid waste') || norm.includes('garbage')) return 'SWM';
  if (norm.includes('stormwater') || norm.includes('drain')) return 'DRAIN';
  if (norm.includes('sewer')) return 'SEWER';
  if (norm.includes('building')) return 'BUILDING';
  if (norm.includes('park')) return 'PARKS';
  if (norm.includes('tree') || norm.includes('greenery')) return 'TREES';
  return 'ROAD';
}

export function getRoutingStatus(deptNameOrCode: string): RoutingStatus {
  const code = getDepartmentCode(deptNameOrCode);
  const config = DEPARTMENTS_CONFIG[code];
  if (!config || code === 'ROAD') return 'Direct';
  return `Moved to ${config.name}`;
}

export function getRoutingMessage(deptNameOrCode: string): string {
  const code = getDepartmentCode(deptNameOrCode);
  const config = DEPARTMENTS_CONFIG[code];
  if (!config || code === 'ROAD') {
    return 'Your complaint has been assigned to the Road Maintenance Department.';
  }
  return `Your complaint has been moved to the ${config.name} Department for further action.`;
}

/**
 * Normalizes citizen complaint description before evaluating keywords:
 * 1. Converts text to lowercase
 * 2. Trims leading and trailing whitespace
 * 3. Collapses repeated whitespace, tabs, and newlines into single spaces
 * 4. Strips interfering punctuation while preserving words
 */
export function normalizeDescription(description: string): string {
  if (!description || typeof description !== 'string') return '';
  return description
    .toLowerCase()
    .replace(/[^\w\s/'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// =========================================================================
// MULTI-DEPARTMENT RULE-BASED CLASSIFICATION SYSTEM
// =========================================================================

export type DepartmentSource = 'ai' | 'ai_classifier' | 'description' | 'field_inspector' | 'officer' | 'manual';
export type RoutingStatus =
  | 'Moved to Solid Waste Management'
  | 'Moved to Stormwater / Drainage'
  | 'Moved to Sewerage'
  | 'Moved to Public Building Maintenance'
  | 'Moved to Parks and Public Spaces'
  | 'Moved to Tree / Greenery Maintenance'
  | 'Direct'
  | 'Moved'
  | 'Reassigned'
  | string;

export interface DepartmentDefinition {
  name: string;
  code: string;
  label: string;
  routingMessageName: string;
  description: string;
  keywords: string[];
}

/**
 * Centralized list of supported municipal departments:
 * 1. Road Maintenance (ROAD) - Primary CivicEye department with full lifecycle
 * 2. Solid Waste Management (SWM) - Routing only
 * 3. Stormwater / Drainage (DRAIN) - Routing only
 * 4. Sewerage (SEWER) - Routing only
 * 5. Public Building Maintenance (BUILDING) - Routing only
 * 6. Parks and Public Spaces (PARKS) - Routing only
 * 7. Tree / Greenery Maintenance (TREES) - Routing only
 */
export const DEPARTMENTS_CONFIG: Record<string, DepartmentDefinition> = {
  PWD: {
    name: 'Public Works Department',
    code: 'PWD',
    label: 'Public Works Department',
    routingMessageName: 'Public Works Department',
    description: 'Public routes, government corridors, arterial public walkways, and state infrastructure',
    keywords: [
      'public works department',
      'public route',
      'public road',
      'public footpath',
      'public pathway',
      'public walkway',
      'public corridor',
      'court road',
      'collectorate road',
      'pwd road',
      'pwd link',
      'public infrastructure',
      'damaged footpath',
      'broken footpath',
      'footpath',
      'pedestrian walkway',
      'pedestrian path',
      'walkway',
      'paver block',
      'pwd',
    ],
  },
  SAFETY: {
    name: 'Traffic / Road Safety Department',
    code: 'SAFETY',
    label: 'Traffic / Road Safety Department',
    routingMessageName: 'Traffic / Road Safety Department',
    description: 'Road dividers, median barriers, missing traffic signs, and speed limit boards',
    keywords: [
      'road divider',
      'median barrier',
      'broken median',
      'damaged divider',
      'divider damage',
      'concrete median',
      'crash barrier',
      'missing signage',
      'damaged sign',
      'signboard broken',
      'speed limit sign',
      'traffic sign',
      'reflector broken',
    ],
  },
  LIGHTING: {
    name: 'Street Lighting Department',
    code: 'LIGHTING',
    label: 'Street Lighting Department',
    routingMessageName: 'Street Lighting Department',
    description: 'Street lights, non-functional luminaires, damaged poles, and hanging power wires',
    keywords: [
      'street light fault',
      'street light broken',
      'street light not working',
      'streetlight broken',
      'streetlight pole',
      'lamp post broken',
      'dark street',
      'light pole bent',
      'dangling electric wire',
      'exposed power cable',
    ],
  },
  ROAD: {
    name: 'Road Maintenance',
    code: 'ROAD',
    label: 'Road Maintenance',
    routingMessageName: 'Road Maintenance Department',
    description: 'Road surface, potholes, structural cracking, and pavements',
    keywords: [
      'alligator crack',
      'alligator cracking',
      'road damage',
      'damaged road',
      'broken road',
      'road crack',
      'pothole',
      'potholes',
      'asphalt',
      'tar road',
      'pavement',
      'pavement crack',
      'crater in road',
      'speed breaker',
      'uneven road',
      'cracking',
      'crack',
      'cracks',
    ],
  },
  SWM: {
    name: 'Solid Waste Management',
    code: 'SWM',
    label: 'Solid Waste Management',
    routingMessageName: 'Solid Waste Management Department',
    description: 'Garbage overflow, solid waste, uncollected trash, overflowing dustbins, and litter issues',
    keywords: [
      'overflowing garbage bin',
      'overflowing dustbin',
      'dustbin is overflowing',
      'garbage is overflowing',
      'garbage overflow near college gate',
      'garbage overflow',
      'garbage not collected',
      'waste not collected',
      'garbage bin problems',
      'garbage bin problem',
      'garbage bin',
      'waste bin',
      'trash bin',
      'solid waste issue',
      'solid waste',
      'garbage dump',
      'garbage dumping',
      'dumped garbage',
      'waste dumping',
      'waste dump',
      'waste is dumped',
      'garbage collection',
      'waste collection',
      'household waste',
      'municipal waste',
      'food waste',
      'plastic waste',
      'waste accumulation',
      'garbage accumulation',
      'garbage pile',
      'waste pile',
      'garbage vehicle',
      'stinking waste',
      'rotting waste',
      'uncollected waste',
      'uncollected trash',
      'foul smell',
      'littering',
      'garbage heap',
      'overflowing garbage',
      'garbages',
      'garbage',
      'waste',
      'wastes',
      'trash',
      'litter',
      'rubbish',
      'dustbin',
      'dustbins',
    ],
  },
  DRAIN: {
    name: 'Stormwater / Drainage',
    code: 'DRAIN',
    label: 'Stormwater / Drainage',
    routingMessageName: 'Stormwater / Drainage Department',
    description: 'Stormwater drains, clogged roadside gutters, waterlogging, and drainage blockages',
    keywords: [
      'storm water drain is blocked',
      'stormwater drain is blocked',
      'storm water drain',
      'stormwater drain',
      'rainwater drainage',
      'rainwater is overflowing',
      'rainwater is not flowing',
      'rainwater is not draining',
      'drainage water',
      'drain cover is damaged',
      'drain cover is broken',
      'missing drain cover',
      'damaged drain cover',
      'broken drain cover',
      'drain cover',
      'drainage blockage',
      'drainage problem',
      'drainage issue',
      'drainage overflow',
      'drainage is overflowing',
      'drainage is clogged',
      'blocked drainage',
      'clogged drainage',
      'flooded drain',
      'drain blockage',
      'blocked drain',
      'clogged drain',
      'drain overflow',
      'overflowing drain',
      'open drain',
      'broken drain',
      'damaged drain',
      'stagnant water',
      'water stagnation',
      'rainwater accumulation',
      'waterlogging',
      'water logging',
      'flooded street',
      'storm water',
      'stormwater',
      'storm drain',
      'rain water',
      'rainwater',
      'flooding',
      'drainage',
      'drains',
      'drain',
      'clogged',
    ],
  },
  SEWER: {
    name: 'Sewerage',
    code: 'SEWER',
    label: 'Sewerage Department',
    routingMessageName: 'Sewerage Department',
    description: 'Underground sewerage lines, sewer manholes, and sewage overflows',
    keywords: [
      'sewage water overflow',
      'sewage water overflowing',
      'sewage is overflowing',
      'sewer is overflowing',
      'sewage overflowing',
      'sewer overflowing',
      'overflowing sewage',
      'overflowing sewer',
      'sewage water is leaking',
      'sewerage water is leaking',
      'sewage water leaking',
      'sewerage water leaking',
      'sewage water',
      'sewerage water',
      'wastewater leakage',
      'waste water leakage',
      'wastewater leak',
      'waste water leak',
      'broken sewer pipe',
      'broken sewer line',
      'damaged sewer pipe',
      'damaged sewer line',
      'damaged sewer',
      'broken sewer',
      'sewer pipe is damaged',
      'sewer pipe is broken',
      'sewage pipe is damaged',
      'sewage pipe is broken',
      'sewer line is damaged',
      'sewer line is broken',
      'sewage line is damaged',
      'sewage line is broken',
      'sewer line is blocked',
      'sewage line is blocked',
      'sewer blockage',
      'sewage blockage',
      'sewerage blockage',
      'blocked sewer line',
      'blocked sewage line',
      'blocked sewer pipe',
      'blocked sewage pipe',
      'blocked sewer',
      'blocked sewage',
      'clogged sewer line',
      'clogged sewage line',
      'clogged sewer pipe',
      'clogged sewage pipe',
      'clogged sewer',
      'clogged sewage',
      'sewer manhole overflow',
      'sewage manhole overflow',
      'manhole overflow',
      'manhole is overflowing',
      'overflowing manhole',
      'manhole blockage',
      'manhole is blocked',
      'blocked manhole',
      'clogged manhole',
      'sewer manhole',
      'sewage manhole',
      'sewage leakage',
      'sewer leakage',
      'sewage leak',
      'sewer leak',
      'sewage leaking',
      'sewer leaking',
      'sewage overflow',
      'sewer overflow',
      'sewage drainage',
      'sewer drainage',
      'sewage smell',
      'sewer smell',
      'sewer line',
      'sewage line',
      'sewer pipe',
      'sewage pipe',
      'sewer pipes',
      'sewage pipes',
      'sewer lines',
      'sewage lines',
      'open gutter',
      'gutter overflow',
      'sewerage',
      'sewage',
      'sewer',
      'sewers',
    ],
  },
  BUILDING: {
    name: 'Public Building Maintenance',
    code: 'BUILDING',
    label: 'Public Buildings',
    routingMessageName: 'Public Building Maintenance Department',
    description: 'Municipal buildings, government offices, community halls, and civic property maintenance',
    keywords: [
      'government property damage',
      'public property damage',
      'building maintenance issue',
      'building repair issue',
      'government building repair',
      'public building repair',
      'government building maintenance',
      'public building maintenance',
      'government school building',
      'government school',
      'government building',
      'government office',
      'public building',
      'public office',
      'municipal building',
      'municipal office',
      'corporation building',
      'corporation office',
      'community hall',
      'public toilet',
      'government property',
      'public property',
      'building maintenance',
      'building repair',
      'building damage',
      'damaged building',
      'broken building',
      'building wall',
      'building roof',
      'building door',
      'building window',
      'building doors',
      'building windows',
      'roof leakage',
      'roof leak',
      'roof is leaking',
      'damaged roof',
      'broken roof',
      'ceiling leakage',
      'ceiling leak',
      'ceiling is leaking',
      'ceiling damage',
      'damaged ceiling',
      'broken ceiling',
      'cracked wall',
      'damaged wall',
      'broken wall',
      'wall crack',
      'wall cracks',
      'damaged floor',
      'broken floor',
      'floor damage',
      'damaged door',
      'broken door',
      'damaged window',
      'broken window',
      'damaged windows',
      'broken windows',
    ],
  },
  PARKS: {
    name: 'Parks and Public Spaces',
    code: 'PARKS',
    label: 'Parks & Public Spaces',
    routingMessageName: 'Parks and Public Spaces Department',
    description: 'Public parks, gardens, playgrounds, and recreational public spaces',
    keywords: [
      'broken playground equipment',
      'damaged playground equipment',
      'playground equipment damaged',
      'playground equipment broken',
      'broken park bench',
      'damaged park bench',
      'broken park benches',
      'damaged park benches',
      'broken swing',
      'damaged swing',
      'broken swings',
      'damaged swings',
      'broken slide',
      'damaged slide',
      'broken slides',
      'damaged slides',
      'broken bench',
      'damaged bench',
      'broken benches',
      'damaged benches',
      'broken park fence',
      'damaged park fence',
      'broken park gate',
      'damaged park gate',
      'public space maintenance',
      'public space damage',
      'public space issue',
      'children\'s park',
      'children park',
      'kids park',
      'open public space',
      'community park',
      'community garden',
      'public garden',
      'public park',
      'public parks',
      'public space',
      'public spaces',
      'park maintenance',
      'park cleanliness',
      'park cleaning',
      'park facility',
      'park facilities',
      'park equipment',
      'playground equipment',
      'playground damage',
      'park bench',
      'park benches',
      'public bench',
      'public benches',
      'park fence',
      'park fences',
      'park gate',
      'park gates',
      'park lighting',
      'park light',
      'park lights',
      'park pathway',
      'park walkway',
      'park path',
      'park paths',
      'park damage',
      'park damaged',
      'park issue',
      'play ground',
      'playground',
      'recreational area',
      'recreation area',
      'parks',
      'park',
    ],
  },
  TREES: {
    name: 'Tree / Greenery Maintenance',
    code: 'TREES',
    label: 'Trees & Greenery',
    routingMessageName: 'Tree / Greenery Maintenance Department',
    description: 'Fallen trees, dangerous overhanging branches, and roadside greenery upkeep',
    keywords: [
      'tree maintenance',
      'tree trimming',
      'tree cutting request',
      'tree cutting',
      'tree pruning request',
      'tree pruning',
      'tree branch',
      'tree branches',
      'fallen tree',
      'fallen trees',
      'fallen branch',
      'fallen branches',
      'broken tree branch',
      'broken tree branches',
      'broken branches',
      'broken branch',
      'damaged tree',
      'damaged trees',
      'dangerous tree',
      'dangerous trees',
      'leaning tree',
      'leaning trees',
      'dead tree',
      'dead trees',
      'dry tree',
      'dry trees',
      'dying tree',
      'dying trees',
      'tree removal',
      'overgrown tree',
      'overgrown trees',
      'overgrown branches',
      'low hanging branch',
      'low hanging branches',
      'hanging tree branch',
      'hanging branches',
      'tree obstruction',
      'tree blocking road',
      'tree blocking path',
      'tree blocking walkway',
      'tree fallen on road',
      'tree fallen on street',
      'branch fallen on road',
      'branches fallen on road',
      'tree near road',
      'tree near building',
      'tree near house',
      'tree damage',
      'tree growth',
      'tree root problem',
      'tree roots',
      'tree root',
      'exposed tree roots',
      'damaged tree roots',
      'uprooted tree',
      'uprooted trees',
      'tree stump',
      'tree stumps',
      'stump removal',
      'roadside tree',
      'roadside trees',
      'street tree',
      'street trees',
      'public tree',
      'public trees',
      'avenue trees',
      'roadside greenery',
      'greenery maintenance',
      'greenery issue',
      'greenery problem',
      'greenery',
      'greenary',
      'plant maintenance',
      'plant damage',
      'damaged plants',
      'dead plants',
      'dry plants',
      'overgrown plants',
      'overgrown vegetation',
      'unwanted vegetation',
      'vegetation maintenance',
      'vegetation growth',
      'excessive vegetation',
      'vegetation',
      'overgrown bush',
      'overgrown bushes',
      'bushes',
      'bush',
      'overgrown shrubs',
      'overgrown shrub',
      'shrubs',
      'shrub',
      'overgrown hedge',
      'overgrown hedges',
      'hedges',
      'hedge',
      'grass maintenance',
      'overgrown grass',
      'public greenery',
      'roadside plants',
      'roadside vegetation',
      'public plantation',
      'plantation maintenance',
      'tree plantation',
      'tree planting',
      'garden greenery',
      'green space maintenance',
      'trees touching electric lines',
      'tree branches are touching electric lines',
      'tree branches touching electric lines',
      'tree branches touching power lines',
      'touching electric lines',
      'trees',
      'tree',
      'plants',
      'plant',
    ],
  },
};

export const AVAILABLE_DEPARTMENTS = Object.values(DEPARTMENTS_CONFIG).map(d => ({
  name: d.name,
  code: d.code,
  label: d.label,
  routingMessageName: d.routingMessageName,
}));

/**
 * List of other municipal departments that Field Inspectors can report involvement for.
 * Excludes Road Maintenance since the primary complaint already belongs to Road Maintenance.
 */
export const OTHER_DEPARTMENTS_LIST: string[] = [
  'Solid Waste Management',
  'Stormwater / Drainage',
  'Drainage / Storm Water',
  'Sewerage',
  'Public Building Maintenance',
  'Parks and Public Spaces',
  'Parks / Public Spaces',
  'Tree / Greenery Maintenance',
  'Other',
];

export interface DepartmentClassificationResult {
  department: string;
  departmentCode: string;
  departmentSource: DepartmentSource;
  routingStatus: RoutingStatus;
  routingMessage: string;
  originalDepartment: string;
  matchedKeyword?: string;
  isMoved: boolean;
  explanation: string;
}

/**
 * Checks if a complaint belongs to the Road Maintenance department (full management)
 * vs a routed non-Road department (routing-only destination).
 */
export function isRoadDepartment(
  target?: string | {
    department?: string;
    departmentCode?: string;
    routingStatus?: string;
  } | null
): boolean {
  if (!target) return false;
  if (typeof target === 'string') {
    const norm = target.trim().toLowerCase();
    if (!norm) return false;
    if (norm.startsWith('moved to') || norm === 'moved') return false;
    const code = getDepartmentCode(norm);
    return code === 'ROAD';
  }
  const dept = (target.department || '').trim();
  const code = (target.departmentCode || '').toUpperCase().trim();
  const routing = (target.routingStatus || '').trim();

  if (routing.startsWith('Moved to') || routing === 'Moved') {
    return false;
  }
  if (code && code !== 'ROAD') {
    return false;
  }
  if (dept && dept !== 'Road Maintenance') {
    return false;
  }
  return true;
}

/**
 * Classify a complaint's department based on its text description.
 *
 * Priority Rules:
 * 1. Sewerage (SEWER) keywords checked first (specific sewer/sewage/wastewater/manhole keywords).
 * 2. Solid Waste Management (SWM) keywords checked next (garbage, trash, litter, solid waste).
 * 3. Stormwater / Drainage (DRAIN) keywords checked next (stormwater, rainwater, drain, drainage).
 * 4. Public Building Maintenance (BUILDING) checked next (government property, buildings, walls, roofs).
 * 5. Parks and Public Spaces (PARKS) checked next (playgrounds, swings, benches, park amenities).
 * 6. Tree / Greenery Maintenance (TREES) checked next (fallen trees, overgrown branches, greenery).
 * 7. Road Maintenance keywords checked.
 * 8. Fallback (general/unclear text): default to Road Maintenance ("ROAD").
 */
export function classifyDepartmentFromDescription(
  description: string,
  aiOriginalDepartment = 'Road Maintenance'
): DepartmentClassificationResult {
  const normalizedText = normalizeDescription(description);

  if (!normalizedText) {
    return {
      department: 'Road Maintenance',
      departmentCode: 'ROAD',
      departmentSource: 'ai',
      routingStatus: 'Direct',
      routingMessage: 'Your complaint has been assigned to the Road Maintenance Department.',
      originalDepartment: aiOriginalDepartment,
      isMoved: false,
      explanation: 'No specific keywords found in description; assigned to default Road Maintenance Department.',
    };
  }

  // 1. Check Public Works Department (Public routes, PWD corridors, public footpaths)
  const pwdConfig = DEPARTMENTS_CONFIG['PWD'];
  if (pwdConfig) {
    const sortedKeywords = [...pwdConfig.keywords].sort((a, b) => b.length - a.length);
    for (const keyword of sortedKeywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      if (regex.test(normalizedText)) {
        return {
          department: pwdConfig.name,
          departmentCode: pwdConfig.code,
          departmentSource: 'description',
          routingStatus: 'Moved to Public Works Department',
          routingMessage: 'Your complaint has been routed to the Public Works Department for public route maintenance.',
          originalDepartment: aiOriginalDepartment,
          matchedKeyword: keyword,
          isMoved: true,
          explanation: `Public-related route / infrastructure identified based on keyword "${keyword}"; routed to Public Works Department.`,
        };
      }
    }
  }

  // 2. Check Sewerage (specific sewer, sewage, wastewater, and manhole keywords)
  const sewerConfig = DEPARTMENTS_CONFIG['SEWER'];
  if (sewerConfig) {
    const sortedSewerKeywords = [...sewerConfig.keywords].sort((a, b) => b.length - a.length);
    for (const keyword of sortedSewerKeywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      if (regex.test(normalizedText)) {
        return {
          department: 'Sewerage',
          departmentCode: 'SEWER',
          departmentSource: 'description',
          routingStatus: 'Moved to Sewerage',
          routingMessage: 'Your complaint has been moved to the Sewerage Department for further action.',
          originalDepartment: aiOriginalDepartment,
          matchedKeyword: keyword,
          isMoved: true,
          explanation: `Identified as a Sewerage issue based on description keyword "${keyword}" and moved to the Sewerage Department.`,
        };
      }
    }
  }

  // 2. Check Solid Waste Management next (preserves existing routing behavior)
  const swmConfig = DEPARTMENTS_CONFIG['SWM'];
  if (swmConfig) {
    const sortedSwmKeywords = [...swmConfig.keywords].sort((a, b) => b.length - a.length);
    for (const keyword of sortedSwmKeywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      if (regex.test(normalizedText)) {
        return {
          department: 'Solid Waste Management',
          departmentCode: 'SWM',
          departmentSource: 'description',
          routingStatus: 'Moved to Solid Waste Management',
          routingMessage: 'Your complaint has been moved to the Solid Waste Management Department for further action.',
          originalDepartment: aiOriginalDepartment,
          matchedKeyword: keyword,
          isMoved: true,
          explanation: `Identified as a Solid Waste issue based on description keyword "${keyword}" and moved to the Solid Waste Management Department.`,
        };
      }
    }
  }

  // 3. Check Stormwater / Drainage (follows exact SWD pattern)
  const drainConfig = DEPARTMENTS_CONFIG['DRAIN'];
  if (drainConfig) {
    const isDrinkingWater = /\b(drinking water|water supply|water pipe|water pipeline|pipeline leak|low water pressure|tap water)\b/i.test(normalizedText);
    const hasExplicitDrain = /\b(storm\s*water|stormwater|drainage|rainwater|rain\s*water|waterlogg?ing|open drain|drain cover|flooded drain|clogged|blocked drain|drain blockage)\b/i.test(normalizedText);

    if (!isDrinkingWater || hasExplicitDrain) {
      const sortedDrainKeywords = [...drainConfig.keywords].sort((a, b) => b.length - a.length);
      for (const keyword of sortedDrainKeywords) {
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
        if (regex.test(normalizedText)) {
          return {
            department: 'Stormwater / Drainage',
            departmentCode: 'DRAIN',
            departmentSource: 'description',
            routingStatus: 'Moved to Stormwater / Drainage',
            routingMessage: 'Your complaint has been moved to the Stormwater / Drainage Department for further action.',
            originalDepartment: aiOriginalDepartment,
            matchedKeyword: keyword,
            isMoved: true,
            explanation: `Identified as a Stormwater / Drainage issue based on description keyword "${keyword}" and moved to the Stormwater / Drainage Department.`,
          };
        }
      }
    }
  }

  // Check Street Lighting
  const lightingConfig = DEPARTMENTS_CONFIG['LIGHTING'];
  if (lightingConfig) {
    const sortedKeywords = [...lightingConfig.keywords].sort((a, b) => b.length - a.length);
    for (const keyword of sortedKeywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\  // 4. Check Public Building Maintenance')}`, 'i');
      if (regex.test(normalizedText)) {
        return {
          department: lightingConfig.name,
          departmentCode: lightingConfig.code,
          departmentSource: 'description',
          routingStatus: 'Moved to Street Lighting Department',
          routingMessage: 'Your complaint has been moved to the Street Lighting Department.',
          originalDepartment: aiOriginalDepartment,
          matchedKeyword: keyword,
          isMoved: true,
          explanation: `Identified as a Street Lighting issue based on description keyword "${keyword}".`,
        };
      }
    }
  }

  // Check Traffic / Road Safety
  const safetyConfig = DEPARTMENTS_CONFIG['SAFETY'];
  if (safetyConfig) {
    const sortedKeywords = [...safetyConfig.keywords].sort((a, b) => b.length - a.length);
    for (const keyword of sortedKeywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\  // 4. Check Public Building Maintenance')}`, 'i');
      if (regex.test(normalizedText)) {
        return {
          department: safetyConfig.name,
          departmentCode: safetyConfig.code,
          departmentSource: 'description',
          routingStatus: 'Moved to Traffic / Road Safety Department',
          routingMessage: 'Your complaint has been routed to the Traffic / Road Safety Department.',
          originalDepartment: aiOriginalDepartment,
          matchedKeyword: keyword,
          isMoved: true,
          explanation: `Identified as a Traffic & Road Safety issue based on description keyword "${keyword}".`,
        };
      }
    }
  }

  // 4. Check Public Building Maintenance (follows exact SWD / DRAIN / SEWER pattern)
  const buildingConfig = DEPARTMENTS_CONFIG['BUILDING'];
  if (buildingConfig) {
    const hasRoadDefect = /\b(pothole|potholes|alligator crack|alligator cracking|crater|broken road|damaged road|road damage|damaged the road|road.*damaged|speed breaker)\b/i.test(normalizedText);
    const hasBuildingDefect = /\b(roof leak|roof leakage|roof is leaking|ceiling leak|ceiling leakage|ceiling is leaking|broken ceiling|damaged ceiling|ceiling damage|broken door|damaged door|broken window|damaged window|broken windows|damaged windows|damaged floor|broken floor|floor damage|cracked wall|damaged wall|wall crack|wall cracks|broken wall|building wall|building roof|building door|building window|building doors|building windows|inside the building|inside the office|inside the corporation|inside the government|building repair|building maintenance|building damage|damaged building|broken building|property damage)\b/i.test(normalizedText);

    if (!hasRoadDefect || hasBuildingDefect) {
      const sortedBuildingKeywords = [...buildingConfig.keywords].sort((a, b) => b.length - a.length);
      for (const keyword of sortedBuildingKeywords) {
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
        if (regex.test(normalizedText)) {
          return {
            department: 'Public Building Maintenance',
            departmentCode: 'BUILDING',
            departmentSource: 'description',
            routingStatus: 'Moved to Public Building Maintenance',
            routingMessage: 'Your complaint has been moved to the Public Building Maintenance Department for further action.',
            originalDepartment: aiOriginalDepartment,
            matchedKeyword: keyword,
            isMoved: true,
            explanation: `Identified as a Public Building Maintenance issue based on description keyword "${keyword}" and moved to the Public Building Maintenance Department.`,
          };
        }
      }
    }
  }

  // 5. Check Parks and Public Spaces (follows exact SWD / DRAIN / SEWER / BUILDING pattern)
  const parksConfig = DEPARTMENTS_CONFIG['PARKS'];
  if (parksConfig) {
    const hasRoadDefect = /\b(pothole|potholes|alligator crack|alligator cracking|crater|broken road|damaged road|road damage|damaged the road|road.*damaged|speed breaker)\b/i.test(normalizedText);
    const hasParkDefect = /\b(playground equipment|broken swing|damaged swing|broken swings|damaged swings|broken slide|damaged slide|broken slides|damaged slides|broken bench|damaged bench|broken benches|damaged benches|broken park bench|damaged park bench|broken park benches|damaged park benches|park bench|park benches|public bench|public benches|damaged park fence|broken park fence|damaged park gate|broken park gate|park cleanliness|park cleaning|playground damage|playground equipment damaged|playground equipment broken|broken playground equipment|damaged playground equipment|public space maintenance|public space damage|public space issue)\b/i.test(normalizedText);
    const hasTreeDefect = /\b(fallen tree|fallen trees|fallen branch|fallen branches|broken tree branch|broken tree branches|broken branches|broken branch|tree blocking|branches blocking|tree fallen|branch fallen|branches fallen|tree trimming|tree pruning|tree cutting|tree removal|tree maintenance|stump removal|dangerous tree|dangerous trees|leaning tree|leaning trees|dead tree|dead trees|dry tree|dry trees|dying tree|dying trees|uprooted tree|uprooted trees|overgrown tree|overgrown trees|overgrown branches|overgrown vegetation|overgrown bush|overgrown bushes|overgrown shrubs|overgrown shrub|overgrown hedge|overgrown hedges|overgrown grass|low hanging branch|low hanging branches|hanging tree branch|hanging branches|tree roots|tree root|tree obstruction|tree damage|greenery maintenance|plant maintenance|vegetation maintenance|touching electric lines|touching power lines|trees need trimming|tree branches are overgrown|overgrown inside the public park|trees in the roadside area need maintenance|roadside trees need maintenance)\b/i.test(normalizedText);

    if ((!hasRoadDefect || hasParkDefect) && (!hasTreeDefect || hasParkDefect)) {
      const sortedParksKeywords = [...parksConfig.keywords].sort((a, b) => b.length - a.length);
      for (const keyword of sortedParksKeywords) {
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
        if (regex.test(normalizedText)) {
          return {
            department: 'Parks and Public Spaces',
            departmentCode: 'PARKS',
            departmentSource: 'description',
            routingStatus: 'Moved to Parks and Public Spaces',
            routingMessage: 'Your complaint has been moved to the Parks and Public Spaces Department.',
            originalDepartment: aiOriginalDepartment,
            matchedKeyword: keyword,
            isMoved: true,
            explanation: `Identified as a Parks and Public Spaces issue based on description keyword "${keyword}" and moved to the Parks and Public Spaces Department.`,
          };
        }
      }
    }
  }

  // 6. Check Tree / Greenery Maintenance (follows exact SWD / DRAIN / SEWER / BUILDING / PARKS pattern)
  const treesConfig = DEPARTMENTS_CONFIG['TREES'];
  if (treesConfig) {
    const hasRoadDamagePrimary = /\b(pothole|potholes|alligator crack|alligator cracking|crater in road|damaged the road|damaged road|road damage|road.*damaged|broken road|speed breaker)\b/i.test(normalizedText);
    const hasTreeDefect = /\b(fallen tree|fallen trees|fallen branch|fallen branches|broken tree branch|broken tree branches|broken branches|broken branch|tree blocking|branches blocking|tree fallen|branch fallen|branches fallen|tree trimming|tree pruning|tree cutting|tree removal|tree maintenance|stump removal|dangerous tree|dangerous trees|leaning tree|leaning trees|dead tree|dead trees|dry tree|dry trees|dying tree|dying trees|uprooted tree|uprooted trees|overgrown tree|overgrown trees|overgrown branches|overgrown vegetation|overgrown bush|overgrown bushes|overgrown shrubs|overgrown shrub|overgrown hedge|overgrown hedges|overgrown grass|low hanging branch|low hanging branches|hanging tree branch|hanging branches|tree roots|tree root|tree obstruction|tree damage|greenery maintenance|plant maintenance|vegetation maintenance|touching electric lines|touching power lines|trees need trimming|tree branches are overgrown|overgrown inside the public park|trees in the roadside area need maintenance|roadside trees need maintenance|trees near road need maintenance|trees near building need maintenance|trees near house need maintenance)\b/i.test(normalizedText);

    if (!hasRoadDamagePrimary || (hasTreeDefect && !/\b(pothole|potholes|alligator crack|crater in road|damaged the road|damaged road|road damage|road.*damaged)\b/i.test(normalizedText))) {
      const sortedTreesKeywords = [...treesConfig.keywords].sort((a, b) => b.length - a.length);
      for (const keyword of sortedTreesKeywords) {
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
        if (regex.test(normalizedText)) {
          if (hasRoadDamagePrimary) {
            continue;
          }
          return {
            department: 'Tree / Greenery Maintenance',
            departmentCode: 'TREES',
            departmentSource: 'description',
            routingStatus: 'Moved to Tree / Greenery Maintenance',
            routingMessage: 'Your complaint has been moved to the Tree / Greenery Maintenance Department.',
            originalDepartment: aiOriginalDepartment,
            matchedKeyword: keyword,
            isMoved: true,
            explanation: `Identified as a Tree / Greenery Maintenance issue based on description keyword "${keyword}" and moved to the Tree / Greenery Maintenance Department.`,
          };
        }
      }
    }
  }

  // 7. Check Road Maintenance keywords
  const roadConfig = DEPARTMENTS_CONFIG['ROAD'];
  if (roadConfig) {
    const sortedRoadKeywords = [...roadConfig.keywords].sort((a, b) => b.length - a.length);
    for (const keyword of sortedRoadKeywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      if (regex.test(normalizedText)) {
        return {
          department: roadConfig.name,
          departmentCode: roadConfig.code,
          departmentSource: 'description',
          routingStatus: 'Direct',
          routingMessage: 'Your complaint has been assigned to the Road Maintenance Department.',
          originalDepartment: aiOriginalDepartment,
          matchedKeyword: keyword,
          isMoved: false,
          explanation: `Road maintenance issue confirmed by description keyword "${keyword}".`,
        };
      }
    }
  }

  // 8. Fallback: description is general or default -> Road Maintenance
  return {
    department: 'Road Maintenance',
    departmentCode: 'ROAD',
    departmentSource: 'ai',
    routingStatus: 'Direct',
    routingMessage: 'Your complaint has been assigned to the Road Maintenance Department.',
    originalDepartment: aiOriginalDepartment,
    isMoved: false,
    explanation: 'Description was general or unclear; kept under Road Maintenance for officer review.',
  };
}
