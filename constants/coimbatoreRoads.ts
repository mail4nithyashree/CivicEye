/**
 * Coimbatore Road Infrastructure & Maintenance Authority Catalog
 *
 * Covers the 4 designated project regions:
 * 1. Maniyakarampalayam
 * 2. Ganapathy
 * 3. Gandhipuram
 * 4. Peelamedu
 *
 * References Tamil Nadu Government Road & Highways administration standards:
 * https://www.tn.gov.in/dept_profile.php?dep_id=NDI=
 */

export type CoimbatoreRegion =
  | 'Maniyakarampalayam'
  | 'Ganapathy'
  | 'Gandhipuram'
  | 'Peelamedu';

export const ALL_COIMBATORE_REGIONS: CoimbatoreRegion[] = [
  'Maniyakarampalayam',
  'Ganapathy',
  'Gandhipuram',
  'Peelamedu',
];

export interface RegionBounds {
  name: CoimbatoreRegion;
  displayName: string;
  centerLat: number;
  centerLng: number;
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
  description: string;
  primaryZone: string;
}

export const REGION_METADATA: Record<CoimbatoreRegion, RegionBounds> = {
  Maniyakarampalayam: {
    name: 'Maniyakarampalayam',
    displayName: 'Maniyakarampalayam (North Zone)',
    centerLat: 11.0425,
    centerLng: 76.9698,
    latMin: 11.0320,
    latMax: 11.0550,
    lngMin: 76.9580,
    lngMax: 76.9820,
    description: 'Residential & Commercial sector connecting Ganapathy and Nallampalayam',
    primaryZone: 'Coimbatore Corporation - North Zone (Ward 24/25)',
  },
  Ganapathy: {
    name: 'Ganapathy',
    displayName: 'Ganapathy (East/North Corridor)',
    centerLat: 11.0318,
    centerLng: 76.9847,
    latMin: 11.0200,
    latMax: 11.0450,
    lngMin: 76.9700,
    lngMax: 77.0000,
    description: 'Major industrial & residential hub along Sathy Road corridor',
    primaryZone: 'Coimbatore Corporation - North/East Zone (Ward 28-32)',
  },
  Gandhipuram: {
    name: 'Gandhipuram',
    displayName: 'Gandhipuram (Central Commercial Hub)',
    centerLat: 11.0168,
    centerLng: 76.9672,
    latMin: 11.0050,
    latMax: 11.0280,
    lngMin: 76.9550,
    lngMax: 76.9800,
    description: 'Central Commercial District, Bus Terminus, and Dr. Nanjappa Road link',
    primaryZone: 'Coimbatore Corporation - Central Zone (Ward 48-52)',
  },
  Peelamedu: {
    name: 'Peelamedu',
    displayName: 'Peelamedu (Avinashi Road & Educational Corridor)',
    centerLat: 11.0284,
    centerLng: 77.0125,
    latMin: 11.0100,
    latMax: 11.0420,
    lngMin: 76.9950,
    lngMax: 77.0350,
    description: 'Major Institutional, IT, Airport corridor and National Highway link',
    primaryZone: 'Coimbatore Corporation - East Zone (Ward 38-42) & Highways Wing',
  },
};

export interface RoadRecord {
  roadId: string;
  roadName: string;
  region: CoimbatoreRegion;
  roadType: 'Major Arterial' | 'State Highway' | 'Bus Route Road' | 'Commercial Corridor' | 'Corporation Ward Road' | 'National Highway Link' | 'Public Route Road';
  coordinates: {
    latitude: number;
    longitude: number;
  };
  maintainedBy: string;
  authority: string;
  department: string;
  officer: string;
  contact: string;
  activeStatus: boolean;
}

export const COIMBATORE_ROADS: RoadRecord[] = [
  // 1. Maniyakarampalayam
  {
    roadId: 'CBE-MNY-001',
    roadName: 'Maniyakarampalayam Main Road',
    region: 'Maniyakarampalayam',
    roadType: 'Bus Route Road',
    coordinates: { latitude: 11.0425, longitude: 76.9698 },
    maintainedBy: 'Coimbatore City Municipal Corporation (CCMC)',
    authority: 'CCMC North Zone Engineering Wing',
    department: 'Roads & Pavements Division - CCMC',
    officer: 'Assistant Executive Engineer (North)',
    contact: '+91 422 2212341 / aee.north@ccmc.gov.in',
    activeStatus: true,
  },
  {
    roadId: 'CBE-MNY-002',
    roadName: 'Nallampalayam - Maniyakarampalayam Link Road',
    region: 'Maniyakarampalayam',
    roadType: 'Corporation Ward Road',
    coordinates: { latitude: 11.0478, longitude: 76.9654 },
    maintainedBy: 'Coimbatore City Municipal Corporation (CCMC)',
    authority: 'CCMC North Zone Ward 24 Office',
    department: 'Ward Maintenance Department - CCMC',
    officer: 'Junior Engineer (Ward 24)',
    contact: '+91 422 2212342 / je.ward24@ccmc.gov.in',
    activeStatus: true,
  },
  {
    roadId: 'CBE-MNY-003',
    roadName: 'Gounder Mills to Maniyakarampalayam Road',
    region: 'Maniyakarampalayam',
    roadType: 'Major Arterial',
    coordinates: { latitude: 11.0401, longitude: 76.9632 },
    maintainedBy: 'State Highways Department (C&M)',
    authority: 'Tamil Nadu Highways Department - Coimbatore Division',
    department: 'Highways Construction & Maintenance Wing (C&M)',
    officer: 'Divisional Engineer (Highways), Coimbatore',
    contact: '+91 422 2300155 / de.highways.cbe@tn.gov.in',
    activeStatus: true,
  },
  {
    roadId: 'CBE-MNY-004',
    roadName: 'Maniyakarampalayam Community Centre Public Route',
    region: 'Maniyakarampalayam',
    roadType: 'Public Route Road',
    coordinates: { latitude: 11.0440, longitude: 76.9670 },
    maintainedBy: 'Public Works Department (PWD)',
    authority: 'PWD Coimbatore North Division',
    department: 'Public Works Department - State Public Routes Wing',
    officer: 'Junior Engineer (PWD Maniyakarampalayam)',
    contact: '+91 422 2300557 / je.pwd.mny@tn.gov.in',
    activeStatus: true,
  },

  // 2. Ganapathy
  {
    roadId: 'CBE-GNP-001',
    roadName: 'Sathy Road (Ganapathy Stretch)',
    region: 'Ganapathy',
    roadType: 'State Highway',
    coordinates: { latitude: 11.0318, longitude: 76.9847 },
    maintainedBy: 'State Highways Department (C&M)',
    authority: 'Tamil Nadu State Highways Department (SH-15 Wing)',
    department: 'Highways & Minor Ports Dept, Govt of Tamil Nadu',
    officer: 'Assistant Divisional Engineer (Highways - Sathy Road Sub-Division)',
    contact: '+91 422 2300222 / ade.sathy.highways@tn.gov.in',
    activeStatus: true,
  },
  {
    roadId: 'CBE-GNP-002',
    roadName: 'Ganapathy - Avarampalayam Road',
    region: 'Ganapathy',
    roadType: 'Major Arterial',
    coordinates: { latitude: 11.0265, longitude: 76.9821 },
    maintainedBy: 'Coimbatore City Municipal Corporation (CCMC)',
    authority: 'CCMC East Zone Road Division',
    department: 'Roads & Infrastructure Wing - CCMC',
    officer: 'Assistant Executive Engineer (East Zone)',
    contact: '+91 422 2212345 / aee.east@ccmc.gov.in',
    activeStatus: true,
  },
  {
    roadId: 'CBE-GNP-003',
    roadName: 'Athipalayam Pirivu Link Road',
    region: 'Ganapathy',
    roadType: 'Corporation Ward Road',
    coordinates: { latitude: 11.0389, longitude: 76.9892 },
    maintainedBy: 'Coimbatore City Municipal Corporation (CCMC)',
    authority: 'CCMC North/East Combined Road Maintenance',
    department: 'Ward Maintenance Department - CCMC',
    officer: 'Junior Engineer (Ganapathy Sector)',
    contact: '+91 422 2212346 / je.ganapathy@ccmc.gov.in',
    activeStatus: true,
  },
  {
    roadId: 'CBE-GNP-004',
    roadName: 'Ganapathy Government Hospital Public Link Route',
    region: 'Ganapathy',
    roadType: 'Public Route Road',
    coordinates: { latitude: 11.0345, longitude: 76.9810 },
    maintainedBy: 'Public Works Department (PWD)',
    authority: 'PWD Coimbatore North Sub-Division',
    department: 'Public Works Department - Public Routes Division',
    officer: 'Assistant Executive Engineer (PWD Ganapathy)',
    contact: '+91 422 2300556 / aee.pwd.ganapathy@tn.gov.in',
    activeStatus: true,
  },

  // 3. Gandhipuram
  {
    roadId: 'CBE-GDP-001',
    roadName: 'Dr. Nanjappa Road (Gandhipuram Commercial Corridor)',
    region: 'Gandhipuram',
    roadType: 'Commercial Corridor',
    coordinates: { latitude: 11.0168, longitude: 76.9672 },
    maintainedBy: 'Coimbatore City Municipal Corporation (CCMC)',
    authority: 'CCMC Central Zone Engineering Wing',
    department: 'Special Roads & Bridges Division - CCMC',
    officer: 'Executive Engineer (Central Zone)',
    contact: '+91 422 2212300 / ee.central@ccmc.gov.in',
    activeStatus: true,
  },
  {
    roadId: 'CBE-GDP-002',
    roadName: 'Cross Cut Road',
    region: 'Gandhipuram',
    roadType: 'Commercial Corridor',
    coordinates: { latitude: 11.0195, longitude: 76.9645 },
    maintainedBy: 'Coimbatore City Municipal Corporation (CCMC)',
    authority: 'CCMC Central Zone Commercial Corridor Cell',
    department: 'Urban Pavements & Town Planning - CCMC',
    officer: 'Assistant Executive Engineer (Central Roads)',
    contact: '+91 422 2212305 / aee.crosscut@ccmc.gov.in',
    activeStatus: true,
  },
  {
    roadId: 'CBE-GDP-003',
    roadName: '100 Feet Road (Gandhipuram - Tatabad)',
    region: 'Gandhipuram',
    roadType: 'Major Arterial',
    coordinates: { latitude: 11.0220, longitude: 76.9690 },
    maintainedBy: 'Coimbatore City Municipal Corporation (CCMC)',
    authority: 'CCMC Central Zone Engineering Wing',
    department: 'Roads & Bridges Division - CCMC',
    officer: 'Assistant Executive Engineer (100ft Road Maintenance)',
    contact: '+91 422 2212308 / aee.100ft@ccmc.gov.in',
    activeStatus: true,
  },
  {
    roadId: 'CBE-GDP-004',
    roadName: 'Coimbatore Combined Court & PWD Public Corridor',
    region: 'Gandhipuram',
    roadType: 'Public Route Road',
    coordinates: { latitude: 11.0142, longitude: 76.9695 },
    maintainedBy: 'Public Works Department (PWD - Buildings & Roads Wing)',
    authority: 'Tamil Nadu Public Works Department (PWD Coimbatore Circle)',
    department: 'Public Works Department - State Infrastructure Wing',
    officer: 'Executive Engineer (PWD Coimbatore)',
    contact: '+91 422 2300550 / ee.pwd.cbe@tn.gov.in',
    activeStatus: true,
  },

  // 4. Peelamedu
  {
    roadId: 'CBE-PLM-001',
    roadName: 'Avinashi Road (Peelamedu Corridor - NH 544 Link)',
    region: 'Peelamedu',
    roadType: 'State Highway',
    coordinates: { latitude: 11.0284, longitude: 77.0125 },
    maintainedBy: 'State Highways Department (C&M)',
    authority: 'Tamil Nadu Highways & Minor Ports Department (Coimbatore East Division)',
    department: 'Highways C&M / Avinashi Road Elevated Corridor Wing',
    officer: 'Divisional Engineer (Highways - C&M), Avinashi Road Division',
    contact: '+91 422 2300300 / de.avinashi.highways@tn.gov.in',
    activeStatus: true,
  },
  {
    roadId: 'CBE-PLM-002',
    roadName: 'Peelamedu Pudur Main Road',
    region: 'Peelamedu',
    roadType: 'Bus Route Road',
    coordinates: { latitude: 11.0340, longitude: 77.0180 },
    maintainedBy: 'Coimbatore City Municipal Corporation (CCMC)',
    authority: 'CCMC East Zone Ward 39 Office',
    department: 'Roads & Ward Infrastructure - CCMC',
    officer: 'Assistant Executive Engineer (East Zone - Peelamedu)',
    contact: '+91 422 2212380 / aee.peelamedu@ccmc.gov.in',
    activeStatus: true,
  },
  {
    roadId: 'CBE-PLM-003',
    roadName: 'Hope College to Tidel Park Road',
    region: 'Peelamedu',
    roadType: 'Major Arterial',
    coordinates: { latitude: 11.0245, longitude: 77.0080 },
    maintainedBy: 'Coimbatore City Municipal Corporation (CCMC)',
    authority: 'CCMC IT Corridor & Roads Wing',
    department: 'Highways & Smart City Infrastructure - CCMC',
    officer: 'Executive Engineer (IT Corridor & Infrastructure)',
    contact: '+91 422 2212385 / ee.tidelroad@ccmc.gov.in',
    activeStatus: true,
  },
  {
    roadId: 'CBE-PLM-004',
    roadName: 'Government Polytechnic & PWD Public Link Route',
    region: 'Peelamedu',
    roadType: 'Public Route Road',
    coordinates: { latitude: 11.0260, longitude: 77.0050 },
    maintainedBy: 'Public Works Department (PWD)',
    authority: 'PWD Coimbatore East Division',
    department: 'Public Works Department - Public Routes Division',
    officer: 'Assistant Executive Engineer (PWD Peelamedu)',
    contact: '+91 422 2300555 / aee.pwd.peelamedu@tn.gov.in',
    activeStatus: true,
  },
];

export interface SecondaryDepartment {
  departmentId: string;
  departmentName: string;
  authorityName: string;
  domain: string;
  officerName: string;
  contact: string;
  description: string;
}

export const SECONDARY_DEPARTMENTS: SecondaryDepartment[] = [
  {
    departmentId: 'TN-PWD-01',
    departmentName: 'Public Works Department (PWD - Tamil Nadu)',
    authorityName: 'PWD Coimbatore Circle (Buildings & Public Infrastructure)',
    domain: 'Public Routes, Government Complex Corridors & Public Footpaths',
    officerName: 'Superintending Engineer (PWD Coimbatore)',
    contact: '+91 422 2300500 / se.pwd.cbe@tn.gov.in',
    description: 'State public routes, public walkways, culverts, and government institutional corridors.',
  },
  {
    departmentId: 'CIVIC-SWM-01',
    departmentName: 'Solid Waste Management',
    authorityName: 'Coimbatore Corporation Solid Waste & Sanitation Wing',
    domain: 'Garbage accumulation, overflowing dustbins, roadside dumping',
    officerName: 'S. Rathinam (Sanitary Officer, SWM)',
    contact: '+91 422 2212301 / swm.cbe@tn.gov.in',
    description: 'Garbage dumping, litter piles, or waste accumulation affecting road margins.',
  },
  {
    departmentId: 'CIVIC-DRAIN-01',
    departmentName: 'Stormwater / Drainage',
    authorityName: 'Coimbatore Stormwater & Flood Management Division',
    domain: 'Stormwater drain blockage, flooding, missing drain covers, open drain hazards',
    officerName: 'M. Anandhan (Stormwater Drains Division)',
    contact: '+91 422 2212399 / drainage.cbe@tn.gov.in',
    description: 'Blocked, broken, or overflowing stormwater drains causing road waterlogging.',
  },
  {
    departmentId: 'CIVIC-SEWER-01',
    departmentName: 'Sewerage',
    authorityName: 'Coimbatore Corporation Underground Sewerage (UGD) Wing',
    domain: 'Underground sewer leakage, sewage water overflow, manhole blockages',
    officerName: 'M. Anandhan (UGD Sewerage Wing)',
    contact: '+91 422 2212399 / sewage.cbe@tn.gov.in',
    description: 'Sewage overflow, broken sewer lines, or settling manholes undermining road foundation.',
  },
  {
    departmentId: 'CIVIC-BUILDING-01',
    departmentName: 'Public Building Maintenance',
    authorityName: 'Public Works Department (Buildings) / Municipal Building Cell',
    domain: 'Government/public building damage, wall cracks, compound wall collapse',
    officerName: 'Er. K. Natarajan (Executive Engineer, Buildings)',
    contact: '+91 422 2451300 / pwd.buildings.cbe@tn.gov.in',
    description: 'Damaged government property, boundary walls, or public building hazards near road.',
  },
  {
    departmentId: 'CIVIC-PARKS-01',
    departmentName: 'Parks and Public Spaces',
    authorityName: 'Coimbatore Parks & Recreation Management Department',
    domain: 'Public park fixtures, broken swings, damaged benches, park fencing/pathways',
    officerName: 'V. Soundararajan (Superintendent of Parks)',
    contact: '+91 422 2212450 / parks.cbe@tn.gov.in',
    description: 'Defects, broken fixtures, or maintenance issues within public parks and recreation areas.',
  },
  {
    departmentId: 'CIVIC-TREES-01',
    departmentName: 'Tree / Greenery Maintenance',
    authorityName: 'Horticulture & Greenery Maintenance Wing',
    domain: 'Fallen trees, dangerous hanging branches, overgrown roadside greenery',
    officerName: 'K. Govindasamy (Horticulture Officer)',
    contact: '+91 422 2451400 / horticulture.cbe@tn.gov.in',
    description: 'Overgrown trees, low-hanging branches blocking road vision, or fallen trees.',

  },
  {
    departmentId: 'TN-TWAD-01',
    departmentName: 'TWAD Board (Tamil Nadu Water Supply and Drainage Board)',
    authorityName: 'TWAD Board - Coimbatore Urban Maintenance Wing',
    domain: 'Water Supply Pipeline Leaks & Major Main Line Damage',
    officerName: 'Executive Engineer (TWAD Urban Division)',
    contact: '+91 422 2451201 / ee.twad.cbe@tn.gov.in',
    description: 'Underground drinking water pipeline breaches causing road collapse or erosion.',
  },
  {
    departmentId: 'TN-TANGEDCO-01',
    departmentName: 'TANGEDCO (Tamil Nadu Generation & Distribution Corporation)',
    authorityName: 'TANGEDCO Coimbatore Electricity Distribution Circle',
    domain: 'Underground Cable Trenching & Utility Pole Damage',
    officerName: 'Assistant Executive Engineer (TANGEDCO Distribution)',
    contact: '+91 422 2490500 / aee.tangedco.cbe@tnebnet.org',
    description: 'Underground power cable laying or utility repair disrupting road pavement.',
  },
  {
    departmentId: 'TN-BSNL-01',
    departmentName: 'Telecom & OFC Infrastructure Coordination Cell',
    authorityName: 'District Telecom Coordination Committee (DTCC)',
    domain: 'Optical Fibre Cable Trenching & Restoration',
    officerName: 'Nodal Officer (Telecom Road Restoration)',
    contact: '+91 422 2221100 / dtcc.cbe@tn.gov.in',
    description: 'Telecom utility trenching without proper asphalt layer reinstatement.',
  },
];

/**
 * Calculates Euclidean / Haversine distance between two coordinates in kilometers.
 */
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Match a GPS coordinate to the closest Coimbatore region among the 4 project regions.
 */
export function matchRegionByCoordinates(latitude: number, longitude: number): CoimbatoreRegion {
  let closestRegion: CoimbatoreRegion = 'Gandhipuram';
  let minDistance = Infinity;

  for (const region of ALL_COIMBATORE_REGIONS) {
    const meta = REGION_METADATA[region];
    // Check if within bounding box
    if (
      latitude >= meta.latMin &&
      latitude <= meta.latMax &&
      longitude >= meta.lngMin &&
      longitude <= meta.lngMax
    ) {
      return region;
    }

    const dist = calculateDistanceKm(latitude, longitude, meta.centerLat, meta.centerLng);
    if (dist < minDistance) {
      minDistance = dist;
      closestRegion = region;
    }
  }

  return closestRegion;
}

/**
 * Match coordinates to the closest known road record in Coimbatore.
 */
export function matchRoadByCoordinates(latitude: number, longitude: number): {
  road: RoadRecord;
  distanceKm: number;
  region: CoimbatoreRegion;
} {
  let closestRoad: RoadRecord = COIMBATORE_ROADS[0];
  let minDistance = Infinity;

  for (const road of COIMBATORE_ROADS) {
    const dist = calculateDistanceKm(
      latitude,
      longitude,
      road.coordinates.latitude,
      road.coordinates.longitude
    );
    if (dist < minDistance) {
      minDistance = dist;
      closestRoad = road;
    }
  }

  return {
    road: closestRoad,
    distanceKm: Math.round(minDistance * 100) / 100,
    region: closestRoad.region,
  };
}

/**
 * Get all roads cataloged for a specific Coimbatore region.
 */
export function getRoadsByRegion(region: CoimbatoreRegion): RoadRecord[] {
  return COIMBATORE_ROADS.filter(r => r.region === region);
}

/**
 * Get resolution time recommendation based on severity.
 * Rule: Low = 1–2 days, Medium = 3–4 days, High = 5–7 days.
 */
export function getResolutionTimeRecommendation(severity: 'LOW' | 'MEDIUM' | 'HIGH'): {
  minDays: number;
  maxDays: number;
  suggestedDays: number;
  label: string;
} {
  switch (severity) {
    case 'LOW':
      return { minDays: 1, maxDays: 2, suggestedDays: 2, label: '1–2 Days (Standard Surface Repair)' };
    case 'MEDIUM':
      return { minDays: 3, maxDays: 4, suggestedDays: 3, label: '3–4 Days (Pavement Patching & Compaction)' };
    case 'HIGH':
      return { minDays: 5, maxDays: 7, suggestedDays: 6, label: '5–7 Days (Full Depth Restoration & Structural Base)' };
    default:
      return { minDays: 1, maxDays: 7, suggestedDays: 3, label: '1–7 Days' };
  }
}

export interface PracticalBudgetItem {
  item: string;
  category: 'material' | 'labor' | 'machinery' | 'overhead';
  quantity: string;
  unitCost: number;
  totalCost: number;
}

export interface PracticalBudgetDetails {
  budget: number;                   // Total estimated budget in INR
  materialCost: number;             // Sum of materials
  laborCost: number;                // Sum of labor (workers * days * daily wage)
  machineryCost: number;            // Sum of equipment/machinery
  overheadCost: number;             // Supervision, transport & contingency
  workersCount: number;             // Number of personnel allocated
  estimatedDays: number;            // Number of working days
  dailyWagePerWorker: number;       // Average daily rate (e.g. ₹850/worker/day)
  defectDimensions: string;         // e.g. "Estimated 3.5 m² area (1.5m × 2.3m), 75mm depth"
  description: string;              // Scope summary
  breakdown: PracticalBudgetItem[]; // Transparent itemized breakdown
}

const STANDARD_DAILY_WAGE = 850; // Standard municipal skilled/semi-skilled worker rate in Coimbatore (₹850/day)

/**
 * Calculates a practical, defensible municipal budget based on:
 * 1. Defect size and damage severity
 * 2. Labor requirement (Workers count × Working days × Daily wage)
 * 3. Specific material bill of quantities (Hot-mix asphalt, bitumen tack, stone aggregate, paver blocks, pipes, ductile iron covers, LED fixtures, etc.)
 * 4. Machinery & equipment rentals (Compactors, cutters, rollers, jetting tankers, boom lifts, JCBs)
 */
export function calculatePracticalBudget(
  issueType: string,
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | string = 'MEDIUM',
  customDimensions?: string
): PracticalBudgetDetails {
  const norm = (issueType || '').toLowerCase();
  const sev = (severity || 'MEDIUM').toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH';

  // 1. Potholes & Asphalt Cavities
  if (norm.includes('pothole') || norm.includes('cavity') || norm.includes('crater')) {
    if (sev === 'LOW') {
      const workers = 2;
      const days = 1;
      const labor = workers * days * STANDARD_DAILY_WAGE; // ₹1,700
      const items: PracticalBudgetItem[] = [
        { item: 'Cold-Mix Bituminous Asphalt Mix (2 bags × 25kg)', category: 'material', quantity: '50 kg', unitCost: 950, totalCost: 1900 },
        { item: 'Rapid-Setting Bitumen Tack Coat Emulsion (RS-1)', category: 'material', quantity: '5 Liters', unitCost: 180, totalCost: 900 },
        { item: 'Granular Stone Aggregate (20mm down)', category: 'material', quantity: '0.2 MT', unitCost: 1000, totalCost: 200 },
        { item: `Civic Road Repair Labor (${workers} workers × ${days} day @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
        { item: 'Plate Compactor & Edge Chisel Tool Rental', category: 'machinery', quantity: '1 Day', unitCost: 1800, totalCost: 1800 },
        { item: 'Traffic Cones, Debris Cleanup & Local Supervision', category: 'overhead', quantity: '1 Lumpsum', unitCost: 500, totalCost: 500 },
      ];
      const mat = 3000;
      const mach = 1800;
      const ovh = 500;
      return {
        budget: labor + mat + mach + ovh, // ₹7,000
        materialCost: mat,
        laborCost: labor,
        machineryCost: mach,
        overheadCost: ovh,
        workersCount: workers,
        estimatedDays: days,
        dailyWagePerWorker: STANDARD_DAILY_WAGE,
        defectDimensions: customDimensions || 'Estimated 0.8 m² patch (0.8m × 1.0m), 50mm depth',
        description: 'Cold mix bitumen asphalt patch, tack coat application & plate compaction',
        breakdown: items,
      };
    }

    if (sev === 'HIGH') {
      const workers = 5;
      const days = 3;
      const labor = workers * days * STANDARD_DAILY_WAGE; // ₹12,750
      const items: PracticalBudgetItem[] = [
        { item: 'Bituminous Concrete (BC) Hot Mix (Grade-1)', category: 'material', quantity: '1.8 MT', unitCost: 10500, totalCost: 18900 },
        { item: 'Slow-Setting Prime Coat & Tack Coat Emulsion', category: 'material', quantity: '40 Liters', unitCost: 180, totalCost: 7200 },
        { item: 'Granular Sub-Base (GSB) Coarse Crushed Aggregate', category: 'material', quantity: '1.5 MT', unitCost: 1200, totalCost: 1800 },
        { item: `Civic Road Repair Labor (${workers} workers × ${days} days @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
        { item: '3-Ton Tandem Vibratory Road Roller & Diamond Saw Cutter', category: 'machinery', quantity: '3 Days', unitCost: 1950, totalCost: 5850 },
        { item: 'Traffic Diversion Marshals, Safety Cones & Municipal Engineer Sign-Off', category: 'overhead', quantity: '1 Job', unitCost: 2000, totalCost: 2000 },
      ];
      const mat = 27900;
      const mach = 5850;
      const ovh = 2000;
      return {
        budget: labor + mat + mach + ovh, // ₹48,500
        materialCost: mat,
        laborCost: labor,
        machineryCost: mach,
        overheadCost: ovh,
        workersCount: workers,
        estimatedDays: days,
        dailyWagePerWorker: STANDARD_DAILY_WAGE,
        defectDimensions: customDimensions || 'Estimated 10.0 m² deep crater cluster (2.5m × 4.0m), 150mm depth',
        description: 'Full depth excavation, subgrade GSB stabilization, prime coat & hot-mix asphalt wearing course',
        breakdown: items,
      };
    }

    // MEDIUM severity (Default Pothole)
    const workers = 3;
    const days = 2;
    const labor = workers * days * STANDARD_DAILY_WAGE; // ₹5,100
    const items: PracticalBudgetItem[] = [
      { item: 'Dense Bituminous Macadam (DBM) Hot Mix', category: 'material', quantity: '0.6 MT', unitCost: 10500, totalCost: 6300 },
      { item: 'Tack Coat Bituminous Emulsion (RS-1)', category: 'material', quantity: '15 Liters', unitCost: 180, totalCost: 2700 },
      { item: 'Granular Sub-Base (GSB) Stone Aggregate', category: 'material', quantity: '0.5 MT', unitCost: 1200, totalCost: 600 },
      { item: `Civic Road Repair Crew (${workers} workers × ${days} days @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
      { item: 'Mini Vibratory Plate Compactor & Asphalt Road Saw Cutter', category: 'machinery', quantity: '2 Days', unitCost: 1400, totalCost: 2800 },
      { item: 'Traffic Safety Barricades, Transport & Inspection', category: 'overhead', quantity: '1 Job', unitCost: 1000, totalCost: 1000 },
    ];
    const mat = 9600;
    const mach = 2800;
    const ovh = 1000;
    return {
      budget: labor + mat + mach + ovh, // ₹18,500
      materialCost: mat,
      laborCost: labor,
      machineryCost: mach,
      overheadCost: ovh,
      workersCount: workers,
      estimatedDays: days,
      dailyWagePerWorker: STANDARD_DAILY_WAGE,
      defectDimensions: customDimensions || 'Estimated 3.5 m² area (1.5m × 2.3m), 75mm depth',
      description: 'Hot-mix asphalt patch, tack coat application, base aggregate & roller compaction',
      breakdown: items,
    };
  }

  // 2. Alligator Cracking & Base Fatigue
  if (norm.includes('alligator') || norm.includes('base failure') || norm.includes('fatigue')) {
    if (sev === 'LOW') {
      const workers = 2;
      const days = 2;
      const labor = workers * days * STANDARD_DAILY_WAGE; // ₹3,400
      const items: PracticalBudgetItem[] = [
        { item: 'Elastomeric Rubberized Bitumen Emulsion (45L)', category: 'material', quantity: '45 Liters', unitCost: 160, totalCost: 7200 },
        { item: 'Micro-surfacing Polymer Bonding Primer', category: 'material', quantity: '1 Drum', unitCost: 1400, totalCost: 1400 },
        { item: `Asphalt Seal Crew (${workers} workers × ${days} days @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
        { item: 'Pneumatic Joint Cleaner & Heat Lance', category: 'machinery', quantity: '2 Days', unitCost: 750, totalCost: 1500 },
        { item: 'Safety Warning Cones & Sweep Cleanup', category: 'overhead', quantity: '1 Job', unitCost: 500, totalCost: 500 },
      ];
      const mat = 8600;
      const mach = 1500;
      const ovh = 500;
      return {
        budget: labor + mat + mach + ovh, // ₹14,000
        materialCost: mat,
        laborCost: labor,
        machineryCost: mach,
        overheadCost: ovh,
        workersCount: workers,
        estimatedDays: days,
        dailyWagePerWorker: STANDARD_DAILY_WAGE,
        defectDimensions: customDimensions || 'Estimated 5.0 m² interconnected hairline fatigue crack zone',
        description: 'Crack routing, elastomeric bitumen sealant & micro-surfacing emulsion',
        breakdown: items,
      };
    }

    if (sev === 'HIGH') {
      const workers = 6;
      const days = 4;
      const labor = workers * days * STANDARD_DAILY_WAGE; // ₹20,400
      const items: PracticalBudgetItem[] = [
        { item: 'Bituminous Concrete & DBM Hot Mix (3.5 MT)', category: 'material', quantity: '3.5 MT', unitCost: 10500, totalCost: 36750 },
        { item: 'High-Tensile Biaxial Geogrid Reinforcement (45 m²)', category: 'material', quantity: '45 m²', unitCost: 250, totalCost: 11250 },
        { item: 'Wet Mix Macadam (WMM) Base Course Stone Aggregate', category: 'material', quantity: '4.0 MT', unitCost: 1100, totalCost: 4400 },
        { item: 'Slow-Setting Bitumen Primer & Tack Coat (60L)', category: 'material', quantity: '60 Liters', unitCost: 180, totalCost: 10800 },
        { item: `Structural Road Reconstruction Crew (${workers} workers × ${days} days)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
        { item: 'JCB Excavator, 8-Ton Road Roller & Tipper Truck', category: 'machinery', quantity: '4 Days', unitCost: 3100, totalCost: 12400 },
        { item: 'Core Testing, Traffic Marshals & Municipal Oversight', category: 'overhead', quantity: '1 Job', unitCost: 4000, totalCost: 4000 },
      ];
      const mat = 63200;
      const mach = 12400;
      const ovh = 4000;
      return {
        budget: labor + mat + mach + ovh, // ₹100,000
        materialCost: mat,
        laborCost: labor,
        machineryCost: mach,
        overheadCost: ovh,
        workersCount: workers,
        estimatedDays: days,
        dailyWagePerWorker: STANDARD_DAILY_WAGE,
        defectDimensions: customDimensions || 'Estimated 40.0 m² severe alligator fatigue with subgrade settlement',
        description: 'Subgrade excavation 250mm, geogrid stabilization, WMM base & dual-layer asphalt paving',
        breakdown: items,
      };
    }

    // MEDIUM severity (Default Alligator Cracking)
    const workers = 4;
    const days = 3;
    const labor = workers * days * STANDARD_DAILY_WAGE; // ₹10,200
    const items: PracticalBudgetItem[] = [
      { item: 'High-Tensile Glass-fiber Asphalt Reinforcement Grid (18 m²)', category: 'material', quantity: '18 m²', unitCost: 450, totalCost: 8100 },
      { item: 'Dense Bituminous Concrete Hot Mix (1.1 MT)', category: 'material', quantity: '1.1 MT', unitCost: 10500, totalCost: 11550 },
      { item: 'Tack Coat Bituminous Emulsion (20L)', category: 'material', quantity: '20 Liters', unitCost: 180, totalCost: 3600 },
      { item: `Pavement Overlay Crew (${workers} workers × ${days} days @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
      { item: 'Cold Milling Machine Rental (Half Day) & Vibratory Roller', category: 'machinery', quantity: '3 Days', unitCost: 1516, totalCost: 4550 },
      { item: 'Supervision, Waste Haulage & Traffic Channelization', category: 'overhead', quantity: '1 Job', unitCost: 2000, totalCost: 2000 },
    ];
    const mat = 23250;
    const mach = 4550;
    const ovh = 2000;
    return {
      budget: labor + mat + mach + ovh, // ₹40,000
      materialCost: mat,
      laborCost: labor,
      machineryCost: mach,
      overheadCost: ovh,
      workersCount: workers,
      estimatedDays: days,
      dailyWagePerWorker: STANDARD_DAILY_WAGE,
      defectDimensions: customDimensions || 'Estimated 16.0 m² alligator cracking zone with localized rutting',
      description: 'Cold milling 40mm, glass-fiber pavement grid reinforcement & bituminous concrete overlay',
      breakdown: items,
    };
  }

  // 3. Linear & Transverse Cracks
  if (norm.includes('crack') || norm.includes('fissure') || norm.includes('joint')) {
    if (sev === 'LOW') {
      const workers = 2;
      const days = 1;
      const labor = workers * days * STANDARD_DAILY_WAGE; // ₹1,700
      const items: PracticalBudgetItem[] = [
        { item: 'Hot-Pour Polymer Bitumen Crack Sealant (15 kg)', category: 'material', quantity: '15 kg', unitCost: 220, totalCost: 3300 },
        { item: 'Slurry Primer & Bonding Emulsion', category: 'material', quantity: '3 Liters', unitCost: 170, totalCost: 510 },
        { item: `Crack Sealing Technicians (${workers} workers × ${days} day @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
        { item: 'Sealant Heating Kettle Boiler & Hand Applicator', category: 'machinery', quantity: '1 Day', unitCost: 1100, totalCost: 1100 },
        { item: 'Site Cones & Safety Barricading', category: 'overhead', quantity: '1 Job', unitCost: 390, totalCost: 390 },
      ];
      const mat = 3810;
      const mach = 1100;
      const ovh = 390;
      return {
        budget: labor + mat + mach + ovh, // ₹7,000
        materialCost: mat,
        laborCost: labor,
        machineryCost: mach,
        overheadCost: ovh,
        workersCount: workers,
        estimatedDays: days,
        dailyWagePerWorker: STANDARD_DAILY_WAGE,
        defectDimensions: customDimensions || 'Estimated 8.0 meters linear joint fissure (width < 5mm)',
        description: 'Pneumatic crack cleaning & hot-pour rubberized bitumen sealant',
        breakdown: items,
      };
    }

    if (sev === 'HIGH') {
      const workers = 4;
      const days = 3;
      const labor = workers * days * STANDARD_DAILY_WAGE; // ₹10,200
      const items: PracticalBudgetItem[] = [
        { item: 'Bituminous Wearing Course Hot Mix (1.2 MT)', category: 'material', quantity: '1.2 MT', unitCost: 10500, totalCost: 12600 },
        { item: 'Heavy-Duty Self-Adhesive Crack Bridging Membrane (65m)', category: 'material', quantity: '65 Meters', unitCost: 180, totalCost: 11700 },
        { item: 'Bitumen Tack Coat Emulsion (14L)', category: 'material', quantity: '14 Liters', unitCost: 180, totalCost: 2520 },
        { item: `Joint Reconstruction Crew (${workers} workers × ${days} days @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
        { item: 'Seam Milling Saw, Air Compressor & Roller', category: 'machinery', quantity: '3 Days', unitCost: 1600, totalCost: 4800 },
        { item: 'Traffic Safety Marshals & Municipal Inspection', category: 'overhead', quantity: '1 Job', unitCost: 1680, totalCost: 1680 },
      ];
      const mat = 26820;
      const mach = 4800;
      const ovh = 1680;
      return {
        budget: labor + mat + mach + ovh, // ₹43,500
        materialCost: mat,
        laborCost: labor,
        machineryCost: mach,
        overheadCost: ovh,
        workersCount: workers,
        estimatedDays: days,
        dailyWagePerWorker: STANDARD_DAILY_WAGE,
        defectDimensions: customDimensions || 'Estimated 60.0 meters deep edge crack / structural joint fracture',
        description: 'Seam milling (300mm width), structural crack bridging membrane & dense polymer asphalt overlay',
        breakdown: items,
      };
    }

    // MEDIUM severity (Default Cracking)
    const workers = 3;
    const days = 2;
    const labor = workers * days * STANDARD_DAILY_WAGE; // ₹5,100
    const items: PracticalBudgetItem[] = [
      { item: 'Polymer-Modified Bitumen Crack Sealant (45 kg)', category: 'material', quantity: '45 kg', unitCost: 220, totalCost: 9900 },
      { item: 'Polyethylene Closed-Cell Foam Backer Rod (30m)', category: 'material', quantity: '30 Meters', unitCost: 40, totalCost: 1200 },
      { item: 'Tack Emulsion & Surface Bonding Agent (5L)', category: 'material', quantity: '5 Liters', unitCost: 160, totalCost: 800 },
      { item: `Crack Routing Crew (${workers} workers × ${days} days @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
      { item: 'Rotary Joint Router Machine & Hot Air Lance', category: 'machinery', quantity: '2 Days', unitCost: 1100, totalCost: 2200 },
      { item: 'Warning Signs & Traffic Cones', category: 'overhead', quantity: '1 Job', unitCost: 800, totalCost: 800 },
    ];
    const mat = 11900;
    const mach = 2200;
    const ovh = 800;
    return {
      budget: labor + mat + mach + ovh, // ₹20,000
      materialCost: mat,
      laborCost: labor,
      machineryCost: mach,
      overheadCost: ovh,
      workersCount: workers,
      estimatedDays: days,
      dailyWagePerWorker: STANDARD_DAILY_WAGE,
      defectDimensions: customDimensions || 'Estimated 25.0 meters longitudinal crack network (width 5-15mm)',
      description: 'Rotary joint routing, heat lance drying, closed-cell backer rod & modified polymer seal',
      breakdown: items,
    };
  }

  // 4. Road Divider & Barrier Damage
  if (norm.includes('divider') || norm.includes('median') || norm.includes('barrier') || norm.includes('kerb')) {
    if (sev === 'LOW') {
      const workers = 2;
      const days = 1;
      const labor = workers * days * STANDARD_DAILY_WAGE; // ₹1,700
      const items: PracticalBudgetItem[] = [
        { item: 'Solar Aluminium Road Studs / Cats Eyes (6 units)', category: 'material', quantity: '6 units', unitCost: 450, totalCost: 2700 },
        { item: 'M20 Concrete Mortar (2 bags × 50kg)', category: 'material', quantity: '100 kg', unitCost: 400, totalCost: 800 },
        { item: 'Thermoplastic Retro-Reflective Paint (5 Liters)', category: 'material', quantity: '5 Liters', unitCost: 240, totalCost: 1200 },
        { item: `Median Alignment Crew (${workers} workers × ${days} day @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
        { item: 'Core Drill Machine & Alignment Levers', category: 'machinery', quantity: '1 Day', unitCost: 600, totalCost: 600 },
        { item: 'Site Safety Cones & Cleanup', category: 'overhead', quantity: '1 Job', unitCost: 500, totalCost: 500 },
      ];
      const mat = 4700;
      const mach = 600;
      const ovh = 500;
      return {
        budget: labor + mat + mach + ovh, // ₹7,500
        materialCost: mat,
        laborCost: labor,
        machineryCost: mach,
        overheadCost: ovh,
        workersCount: workers,
        estimatedDays: days,
        dailyWagePerWorker: STANDARD_DAILY_WAGE,
        defectDimensions: customDimensions || 'Estimated 3 median kerb units misaligned & missing reflectors',
        description: 'Median realignment, cement mortar grouting & solar retro-reflective studs replacement',
        breakdown: items,
      };
    }

    if (sev === 'HIGH') {
      const workers = 5;
      const days = 4;
      const labor = workers * days * STANDARD_DAILY_WAGE; // ₹17,000
      const items: PracticalBudgetItem[] = [
        { item: 'Galvanized Steel W-Beam Crash Barrier (20 Meters)', category: 'material', quantity: '20 Meters', unitCost: 1850, totalCost: 37000 },
        { item: 'Heavy-Duty Steel Posts & Spacer Blocks (8 Sets)', category: 'material', quantity: '8 Sets', unitCost: 1200, totalCost: 9600 },
        { item: 'Ready-Mix M25 Concrete Foundation Bed (2.5 m³)', category: 'material', quantity: '2.5 m³', unitCost: 5000, totalCost: 12500 },
        { item: 'Retro-Reflective Hazard Markers & Solar Warning Lights', category: 'material', quantity: '1 Set', unitCost: 2400, totalCost: 2400 },
        { item: `Crash Barrier Construction Crew (${workers} workers × ${days} days)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
        { item: 'Hydraulic Post Driver, Mobile Crane & Concrete Transit', category: 'machinery', quantity: '4 Days', unitCost: 1625, totalCost: 6500 },
        { item: 'Night Work Lighting, Traffic Marshals & Engineer Sign-Off', category: 'overhead', quantity: '1 Job', unitCost: 3000, totalCost: 3000 },
      ];
      const mat = 61500;
      const mach = 6500;
      const ovh = 3000;
      return {
        budget: labor + mat + mach + ovh, // ₹88,000
        materialCost: mat,
        laborCost: labor,
        machineryCost: mach,
        overheadCost: ovh,
        workersCount: workers,
        estimatedDays: days,
        dailyWagePerWorker: STANDARD_DAILY_WAGE,
        defectDimensions: customDimensions || 'Estimated 20.0 meters shattered median & twisted W-beam crash barrier',
        description: 'Reinforced concrete median cast-in-situ, W-beam galvanized steel crash barrier replacement & end terminals',
        breakdown: items,
      };
    }

    // MEDIUM severity (Default Divider Damage)
    const workers = 4;
    const days = 2;
    const labor = workers * days * STANDARD_DAILY_WAGE; // ₹6,800
    const items: PracticalBudgetItem[] = [
      { item: 'Pre-Cast RCC M25 Kerb Stones (16 units × 500mm)', category: 'material', quantity: '16 units', unitCost: 650, totalCost: 10400 },
      { item: 'Ready-Mix M20 Bedding Concrete (0.8 m³)', category: 'material', quantity: '0.8 m³', unitCost: 5250, totalCost: 4200 },
      { item: 'Thermoplastic Retro-Reflective Hazard Stripe Paint (12L)', category: 'material', quantity: '12 Liters', unitCost: 280, totalCost: 3360 },
      { item: 'Solar Raised Pavement Markers (8 units)', category: 'material', quantity: '8 units', unitCost: 450, totalCost: 3600 },
      { item: `Kerbstone Installation Crew (${workers} workers × ${days} days @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
      { item: 'Concrete Mixer & Utility Transport Truck', category: 'machinery', quantity: '2 Days', unitCost: 1220, totalCost: 2440 },
      { item: 'Traffic Safety Barricades & Waste Disposal', category: 'overhead', quantity: '1 Job', unitCost: 1200, totalCost: 1200 },
    ];
    const mat = 21560;
    const mach = 2440;
    const ovh = 1200;
    return {
      budget: labor + mat + mach + ovh, // ₹32,000
      materialCost: mat,
      laborCost: labor,
      machineryCost: mach,
      overheadCost: ovh,
      workersCount: workers,
      estimatedDays: days,
      dailyWagePerWorker: STANDARD_DAILY_WAGE,
      defectDimensions: customDimensions || 'Estimated 8.0 meters broken concrete median kerb stones',
      description: 'Pre-cast concrete M25 kerb stones replacement, concrete foundation bed & hazard stripe painting',
      breakdown: items,
    };
  }

  // 5. Street Light Fault & Damaged Pole
  if (norm.includes('light') || norm.includes('lamp') || norm.includes('pole') || norm.includes('luminaire')) {
    if (sev === 'LOW') {
      const workers = 2;
      const days = 1;
      const labor = workers * days * STANDARD_DAILY_WAGE; // ₹1,700
      const items: PracticalBudgetItem[] = [
        { item: '90W High-Efficiency LED Driver + 10kV Surge Protection', category: 'material', quantity: '1 Unit', unitCost: 2200, totalCost: 2200 },
        { item: 'Dusk-to-Dawn Photocell Light Sensor Switch', category: 'material', quantity: '1 Unit', unitCost: 650, totalCost: 650 },
        { item: 'Waterproof Heat-Shrink Connectors & Terminal Block', category: 'material', quantity: '1 Set', unitCost: 350, totalCost: 350 },
        { item: `Certified Electrical Technicians (${workers} workers × ${days} day @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
        { item: 'Insulated Aerial Ladder / Utility Van Rental', category: 'machinery', quantity: '1 Day', unitCost: 800, totalCost: 800 },
        { item: 'Multimeter Insulation Resistance Testing & Certification', category: 'overhead', quantity: '1 Job', unitCost: 300, totalCost: 300 },
      ];
      const mat = 3200;
      const mach = 800;
      const ovh = 300;
      return {
        budget: labor + mat + mach + ovh, // ₹6,000
        materialCost: mat,
        laborCost: labor,
        machineryCost: mach,
        overheadCost: ovh,
        workersCount: workers,
        estimatedDays: days,
        dailyWagePerWorker: STANDARD_DAILY_WAGE,
        defectDimensions: customDimensions || '1 street light luminaire non-functional / sensor driver fault',
        description: 'LED luminaire driver replacement, dusk-to-dawn photocell sensor & surge protector',
        breakdown: items,
      };
    }

    if (sev === 'HIGH') {
      const workers = 4;
      const days = 3;
      const labor = workers * days * STANDARD_DAILY_WAGE; // ₹10,200
      const items: PracticalBudgetItem[] = [
        { item: '9-Meter Galvanized Octagonal Steel Pole with Base Plate', category: 'material', quantity: '1 Unit', unitCost: 16500, totalCost: 16500 },
        { item: '120W High-Lumen Streetlight LED Luminaire Fixture', category: 'material', quantity: '1 Unit', unitCost: 7800, totalCost: 7800 },
        { item: 'RCC M25 Foundation Anchor Cage & J-Bolts (0.8 m³)', category: 'material', quantity: '1 Set', unitCost: 4200, totalCost: 4200 },
        { item: 'Underground Armoured Feeder Cable (15 Meters)', category: 'material', quantity: '15 Meters', unitCost: 320, totalCost: 4800 },
        { item: `Street Lighting Line Technicians (${workers} workers × ${days} days)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
        { item: 'Hydraulic Boom Lift Crane & Concrete Mixer Truck', category: 'machinery', quantity: '3 Days', unitCost: 1500, totalCost: 4500 },
        { item: 'TANGEDCO Power Isolation Safety Clearance & Inspection', category: 'overhead', quantity: '1 Job', unitCost: 2000, totalCost: 2000 },
      ];
      const mat = 33300;
      const mach = 4500;
      const ovh = 2000;
      return {
        budget: labor + mat + mach + ovh, // ₹50,000
        materialCost: mat,
        laborCost: labor,
        machineryCost: mach,
        overheadCost: ovh,
        workersCount: workers,
        estimatedDays: days,
        dailyWagePerWorker: STANDARD_DAILY_WAGE,
        defectDimensions: customDimensions || 'Damaged/bent 9-meter octagonal pole & fallen luminaire',
        description: 'Galvanized octagonal street light pole replacement, RCC foundation casting & 120W LED fixture',
        breakdown: items,
      };
    }

    // MEDIUM severity (Default Street Light)
    const workers = 3;
    const days = 2;
    const labor = workers * days * STANDARD_DAILY_WAGE; // ₹5,100
    const items: PracticalBudgetItem[] = [
      { item: '4-Core 16 sq.mm XLPE Armoured Copper Cable (28m)', category: 'material', quantity: '28 Meters', unitCost: 320, totalCost: 8960 },
      { item: 'IP67 Polycarbonate Pole Junction Box with 16A MCB', category: 'material', quantity: '1 Unit', unitCost: 2400, totalCost: 2400 },
      { item: 'GI Cable Protection Conduit Pipe (100mm) & Sand Bed', category: 'material', quantity: '1 Lot', unitCost: 1540, totalCost: 1540 },
      { item: `Underground Cable Repair Crew (${workers} workers × ${days} days @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
      { item: 'Cable Fault Locator Instrument & Mini Trenching Tool', category: 'machinery', quantity: '2 Days', unitCost: 1000, totalCost: 2000 },
      { item: 'Road Cutting Restoration Permit & Safety Lighting', category: 'overhead', quantity: '1 Job', unitCost: 1000, totalCost: 1000 },
    ];
    const mat = 12900;
    const mach = 2000;
    const ovh = 1000;
    return {
      budget: labor + mat + mach + ovh, // ₹21,000
      materialCost: mat,
      laborCost: labor,
      machineryCost: mach,
      overheadCost: ovh,
      workersCount: workers,
      estimatedDays: days,
      dailyWagePerWorker: STANDARD_DAILY_WAGE,
      defectDimensions: customDimensions || '25 meters underground power cable fault & damaged junction box',
      description: 'Underground cable fault location, trenching, 4-core armoured cable laying & IP67 junction box',
      breakdown: items,
    };
  }

  // 6. Manholes & Drainage Chambers
  if (norm.includes('manhole') || norm.includes('chamber') || norm.includes('catchpit') || norm.includes('drain cover')) {
    if (sev === 'LOW') {
      const workers = 2;
      const days = 1;
      const labor = workers * days * STANDARD_DAILY_WAGE; // ₹1,700
      const items: PracticalBudgetItem[] = [
        { item: 'High-Strength Non-Shrink Epoxy Grout (25kg bag)', category: 'material', quantity: '25 kg', unitCost: 3200, totalCost: 3200 },
        { item: 'Bitumen Mastic Perimeter Sealing Ring', category: 'material', quantity: '1 Lot', unitCost: 800, totalCost: 800 },
        { item: 'Polymer Bonding Mortar Additive', category: 'material', quantity: '5 Liters', unitCost: 120, totalCost: 600 },
        { item: `Chamber Masonry Crew (${workers} workers × ${days} day @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
        { item: 'Demolition Breaker & Hand Levelling Tools', category: 'machinery', quantity: '1 Day', unitCost: 1200, totalCost: 1200 },
        { item: 'Safety Cones & Rapid Curing Barricade', category: 'overhead', quantity: '1 Job', unitCost: 500, totalCost: 500 },
      ];
      const mat = 4600;
      const mach = 1200;
      const ovh = 500;
      return {
        budget: labor + mat + mach + ovh, // ₹8,000
        materialCost: mat,
        laborCost: labor,
        machineryCost: mach,
        overheadCost: ovh,
        workersCount: workers,
        estimatedDays: days,
        dailyWagePerWorker: STANDARD_DAILY_WAGE,
        defectDimensions: customDimensions || '1 manhole frame displaced by 20mm causing vehicle bounce',
        description: 'Catchpit desilting, cast iron frame height adjustment & high-strength epoxy mortar ring',
        breakdown: items,
      };
    }

    if (sev === 'HIGH') {
      const workers = 5;
      const days = 4;
      const labor = workers * days * STANDARD_DAILY_WAGE; // ₹17,000
      const items: PracticalBudgetItem[] = [
        { item: 'Class D400 Heavy-Duty Ductile Iron Frame & Cover (600mm)', category: 'material', quantity: '1 Unit', unitCost: 16000, totalCost: 16000 },
        { item: 'Wire-Cut Brick Masonry Chamber Walls (1,200 bricks)', category: 'material', quantity: '1,200 pcs', unitCost: 12, totalCost: 14400 },
        { item: 'Ready-Mix M25 RCC Base & Top Slab Concrete (1.5 m³)', category: 'material', quantity: '1.5 m³', unitCost: 5000, totalCost: 7500 },
        { item: 'Waterproof Plastering & Hydraulic Benching Mortar', category: 'material', quantity: '1 Job', unitCost: 3800, totalCost: 3800 },
        { item: 'Dense Bituminous Asphalt Pavement Reinstatement (6 m²)', category: 'material', quantity: '0.6 MT', unitCost: 10500, totalCost: 6300 },
        { item: `Deep Chamber Masonry Crew (${workers} workers × ${days} days)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
        { item: 'Dewatering Pump, JCB Excavator & Plate Compactor', category: 'machinery', quantity: '4 Days', unitCost: 1625, totalCost: 6500 },
        { item: 'Gas Safety Detector, Confined Space Gear & Municipal Inspection', category: 'overhead', quantity: '1 Job', unitCost: 2500, totalCost: 2500 },
      ];
      const mat = 48000;
      const mach = 6500;
      const ovh = 2500;
      return {
        budget: labor + mat + mach + ovh, // ₹74,000
        materialCost: mat,
        laborCost: labor,
        machineryCost: mach,
        overheadCost: ovh,
        workersCount: workers,
        estimatedDays: days,
        dailyWagePerWorker: STANDARD_DAILY_WAGE,
        defectDimensions: customDimensions || 'Completely collapsed sewer inspection chamber (depth 2.2m)',
        description: 'Full-depth chamber reconstruction, reinforced concrete bottom slab, brick masonry chamber & ductile iron cover',
        breakdown: items,
      };
    }

    // MEDIUM severity (Default Manhole)
    const workers = 3;
    const days = 2;
    const labor = workers * days * STANDARD_DAILY_WAGE; // ₹5,100
    const items: PracticalBudgetItem[] = [
      { item: 'Class D400 (40 Ton) Ductile Iron Manhole Cover & Frame', category: 'material', quantity: '1 Set', unitCost: 14500, totalCost: 14500 },
      { item: 'Pre-cast M30 Concrete Support Collar Ring', category: 'material', quantity: '1 Unit', unitCost: 3200, totalCost: 3200 },
      { item: 'Rapid-Hardening Non-Shrink Structural Cement Mortar', category: 'material', quantity: '3 Bags', unitCost: 466, totalCost: 1400 },
      { item: 'Cold-Mix Bitumen Asphalt Surface Levelling Ring', category: 'material', quantity: '2 Bags', unitCost: 900, totalCost: 1800 },
      { item: `Chamber Masonry Crew (${workers} workers × ${days} days @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
      { item: 'Concrete Saw Cutter, Breaker & Plate Compactor', category: 'machinery', quantity: '2 Days', unitCost: 1500, totalCost: 3000 },
      { item: 'Traffic Diversion Barricades & Nighttime Curing Protection', category: 'overhead', quantity: '1 Job', unitCost: 1000, totalCost: 1000 },
    ];
    const mat = 20900;
    const mach = 3000;
    const ovh = 1000;
    return {
      budget: labor + mat + mach + ovh, // ₹30,000
      materialCost: mat,
      laborCost: labor,
      machineryCost: mach,
      overheadCost: ovh,
      workersCount: workers,
      estimatedDays: days,
      dailyWagePerWorker: STANDARD_DAILY_WAGE,
      defectDimensions: customDimensions || '1 broken/sunken manhole cover in travel lane',
      description: 'Heavy-duty ductile iron Class D400 cover replacement, RCC collar ring casting & asphalt leveling',
      breakdown: items,
    };
  }

  // 7. Waterlogging & Drainage Choke
  if (norm.includes('waterlogging') || norm.includes('drainage') || norm.includes('drain') || norm.includes('flooding') || norm.includes('water')) {
    if (sev === 'LOW') {
      const workers = 2;
      const days = 1;
      const labor = workers * days * STANDARD_DAILY_WAGE; // ₹1,700
      const items: PracticalBudgetItem[] = [
        { item: 'Galvanized Mild Steel Heavy-Duty Drain Grating (600×450mm)', category: 'material', quantity: '1 Unit', unitCost: 3800, totalCost: 3800 },
        { item: 'Disinfectant Bleaching Powder & Odor Lime (2 bags)', category: 'material', quantity: '50 kg', unitCost: 250, totalCost: 500 },
        { item: `Drainage Cleaning Labor (${workers} workers × ${days} day @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
        { item: 'Manual Silt Extraction Rods & Haulage Cart', category: 'machinery', quantity: '1 Day', unitCost: 1000, totalCost: 1000 },
        { item: 'Sludge Transport & Municipal Tipping Fee', category: 'overhead', quantity: '1 Job', unitCost: 500, totalCost: 500 },
      ];
      const mat = 4300;
      const mach = 1000;
      const ovh = 500;
      return {
        budget: labor + mat + mach + ovh, // ₹7,500
        materialCost: mat,
        laborCost: labor,
        machineryCost: mach,
        overheadCost: ovh,
        workersCount: workers,
        estimatedDays: days,
        dailyWagePerWorker: STANDARD_DAILY_WAGE,
        defectDimensions: customDimensions || '1 clogged storm water inlet / roadside drain grating',
        description: 'Manual catchpit de-silting, debris removal & heavy-duty steel grating replacement',
        breakdown: items,
      };
    }

    if (sev === 'HIGH') {
      const workers = 6;
      const days = 4;
      const labor = workers * days * STANDARD_DAILY_WAGE; // ₹20,400
      const items: PracticalBudgetItem[] = [
        { item: '600mm Dia RCC Hume Drain Pipes NP3 (24 units × 2.5m)', category: 'material', quantity: '60 Meters', unitCost: 700, totalCost: 42000 },
        { item: 'Ready-Mix M20 Pipe Bedding & Haunching Concrete (4.0 m³)', category: 'material', quantity: '4.0 m³', unitCost: 4500, totalCost: 18000 },
        { item: 'Cast-Iron Catchpit Chambers & Heavy Gratings (3 units)', category: 'material', quantity: '3 Units', unitCost: 4500, totalCost: 13500 },
        { item: 'Bituminous Road Pavement Reinstatement (25 m²)', category: 'material', quantity: '2.0 MT', unitCost: 10500, totalCost: 21000 },
        { item: `Stormwater Engineering Crew (${workers} workers × ${days} days)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
        { item: 'JCB Excavator, High-Pressure Jetting Tanker & Compactor', category: 'machinery', quantity: '4 Days', unitCost: 3625, totalCost: 14500 },
        { item: 'Dewatering Pump, Traffic Management & Civil Engineering Supervision', category: 'overhead', quantity: '1 Job', unitCost: 4600, totalCost: 4600 },
      ];
      const mat = 94500;
      const mach = 14500;
      const ovh = 4600;
      return {
        budget: labor + mat + mach + ovh, // ₹134,000
        materialCost: mat,
        laborCost: labor,
        machineryCost: mach,
        overheadCost: ovh,
        workersCount: workers,
        estimatedDays: days,
        dailyWagePerWorker: STANDARD_DAILY_WAGE,
        defectDimensions: customDimensions || '60.0 meters structural storm drain collapse causing road submergence',
        description: 'Excavation, new 600mm RCC NP3 drain pipe laying, storm catchpit chambers & road pavement reinstatement',
        breakdown: items,
      };
    }

    // MEDIUM severity (Default Waterlogging)
    const workers = 4;
    const days = 2;
    const labor = workers * days * STANDARD_DAILY_WAGE; // ₹6,800
    const items: PracticalBudgetItem[] = [
      { item: 'RCC Hume Pipe NP3 Grade Replacement (3 pipes × 2.5m = 7.5m)', category: 'material', quantity: '7.5 Meters', unitCost: 900, totalCost: 6750 },
      { item: 'Granular Sand & Stone Aggregate Cushion Bedding (2.0 MT)', category: 'material', quantity: '2.0 MT', unitCost: 1200, totalCost: 2400 },
      { item: 'Cement Mortar Collar Jointing & Anti-Silt Grouting', category: 'material', quantity: '1 Lot', unitCost: 1650, totalCost: 1650 },
      { item: `Drainage Jetting & Repair Crew (${workers} workers × ${days} days @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
      { item: 'High-Pressure Jetting & Suction Super-Sucker Tanker (1.5 Shifts)', category: 'machinery', quantity: '2 Days', unitCost: 4200, totalCost: 8400 },
      { item: 'Sludge Haulage & Disposal Fee, Traffic Safety Cones', category: 'overhead', quantity: '1 Job', unitCost: 1500, totalCost: 1500 },
    ];
    const mat = 10800;
    const mach = 8400;
    const ovh = 1500;
    return {
      budget: labor + mat + mach + ovh, // ₹27,500
      materialCost: mat,
      laborCost: labor,
      machineryCost: mach,
      overheadCost: ovh,
      workersCount: workers,
      estimatedDays: days,
      dailyWagePerWorker: STANDARD_DAILY_WAGE,
      defectDimensions: customDimensions || '25.0 meters clogged underground stormwater drain pipe (300mm dia)',
      description: 'High-pressure super-sucker jetting, root cutting, silt clearing & damaged pipe section repair',
      breakdown: items,
    };
  }

  // 8. Solid Waste & Garbage Blockage
  if (norm.includes('garbage') || norm.includes('waste') || norm.includes('debris') || norm.includes('rubble') || norm.includes('dump')) {
    if (sev === 'LOW') {
      const workers = 2;
      const days = 1;
      const labor = workers * days * STANDARD_DAILY_WAGE; // ₹1,700
      const items: PracticalBudgetItem[] = [
        { item: 'Heavy-Duty HDPE Waste Collection Sacks (50 pcs)', category: 'material', quantity: '50 pcs', unitCost: 15, totalCost: 750 },
        { item: 'Disinfectant Bleaching Powder & Lime Sanitizer (2 bags)', category: 'material', quantity: '50 kg', unitCost: 13, totalCost: 650 },
        { item: `Sanitary Clearance Workers (${workers} workers × ${days} day @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
        { item: 'Sanitation Push-Cart & Shovel Hand Tools', category: 'machinery', quantity: '1 Day', unitCost: 600, totalCost: 600 },
        { item: 'Solid Waste Transfer Station Tipping Fee', category: 'overhead', quantity: '1 Job', unitCost: 300, totalCost: 300 },
      ];
      const mat = 1400;
      const mach = 600;
      const ovh = 300;
      return {
        budget: labor + mat + mach + ovh, // ₹4,000
        materialCost: mat,
        laborCost: labor,
        machineryCost: mach,
        overheadCost: ovh,
        workersCount: workers,
        estimatedDays: days,
        dailyWagePerWorker: STANDARD_DAILY_WAGE,
        defectDimensions: customDimensions || 'Estimated 1.5 tons scattered roadside waste',
        description: 'Manual waste collection, sweeping, packaging & bleaching powder sanitization',
        breakdown: items,
      };
    }

    if (sev === 'HIGH') {
      const workers = 4;
      const days = 2;
      const labor = workers * days * STANDARD_DAILY_WAGE; // ₹6,800
      const items: PracticalBudgetItem[] = [
        { item: 'Disinfectant Odor Neutralizer & Lime Wash (5 drums)', category: 'material', quantity: '5 Drums', unitCost: 640, totalCost: 3200 },
        { item: 'Road Warning Caution Boards & Barricades', category: 'material', quantity: '1 Set', unitCost: 1200, totalCost: 1200 },
        { item: `Mechanized Debris Clearance Crew (${workers} workers × ${days} days @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
        { item: 'JCB Wheel Loader (1 Day) & 4 Tipper Truck Haulage Trips', category: 'machinery', quantity: '2 Days', unitCost: 6850, totalCost: 13700 },
        { item: 'Inert Landfill Processing Fees & Roadway Safety Marshals', category: 'overhead', quantity: '1 Job', unitCost: 2100, totalCost: 2100 },
      ];
      const mat = 4400;
      const mach = 13700;
      const ovh = 2100;
      return {
        budget: labor + mat + mach + ovh, // ₹27,000
        materialCost: mat,
        laborCost: labor,
        machineryCost: mach,
        overheadCost: ovh,
        workersCount: workers,
        estimatedDays: days,
        dailyWagePerWorker: STANDARD_DAILY_WAGE,
        defectDimensions: customDimensions || 'Estimated 12.0 tons construction demolition debris & garbage blocking roadway',
        description: 'JCB earthmover mechanized clearance, multi-axle compactor truck haulage & roadway pressure wash',
        breakdown: items,
      };
    }

    // MEDIUM severity (Default Garbage)
    const workers = 3;
    const days = 1;
    const labor = workers * days * STANDARD_DAILY_WAGE; // ₹2,550
    const items: PracticalBudgetItem[] = [
      { item: '1.1 m³ Galvanized Dumper Placer Bin Replacement', category: 'material', quantity: '1 Unit', unitCost: 6500, totalCost: 6500 },
      { item: 'Disinfectant Lime & Citronella Sanitization Spray', category: 'material', quantity: '1 Lot', unitCost: 950, totalCost: 950 },
      { item: `Sanitary Clearance Crew (${workers} workers × ${days} day @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
      { item: 'CCMC Mini-Tipper Truck Haulage (2 Trips)', category: 'machinery', quantity: '1 Day', unitCost: 2200, totalCost: 2200 },
      { item: 'Waste Sorting & Transfer Station Processing Fee', category: 'overhead', quantity: '1 Job', unitCost: 800, totalCost: 800 },
    ];
    const mat = 7450;
    const mach = 2200;
    const ovh = 800;
    return {
      budget: labor + mat + mach + ovh, // ₹13,000
      materialCost: mat,
      laborCost: labor,
      machineryCost: mach,
      overheadCost: ovh,
      workersCount: workers,
      estimatedDays: days,
      dailyWagePerWorker: STANDARD_DAILY_WAGE,
      defectDimensions: customDimensions || 'Estimated 4.0 tons illegal garbage dumping spot',
      description: 'Mini-tipper loader haulage, roadside clearing, chemical sanitization & replacement dumper placer bin',
      breakdown: items,
    };
  }

  // 9. Public Routes & Footpaths (Public Works Department)
  if (norm.includes('public') || norm.includes('pwd') || norm.includes('footpath') || norm.includes('walkway') || norm.includes('corridor')) {
    if (sev === 'LOW') {
      const workers = 2;
      const days = 1;
      const labor = workers * days * STANDARD_DAILY_WAGE; // ₹1,700
      const items: PracticalBudgetItem[] = [
        { item: 'M30 Interlocking Concrete Paver Blocks 60mm (4 m²)', category: 'material', quantity: '4 m²', unitCost: 600, totalCost: 2400 },
        { item: 'Screened River Sand Bedding Cushion (0.4 m³)', category: 'material', quantity: '0.4 m³', unitCost: 2500, totalCost: 1000 },
        { item: 'Cement Mortar Edge Restraint (2 bags × 50kg)', category: 'material', quantity: '100 kg', unitCost: 500, totalCost: 1000 },
        { item: `Footpath Masonry Crew (${workers} workers × ${days} day @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
        { item: 'Hand Tamper & Paver Block Guillotine Cutter', category: 'machinery', quantity: '1 Day', unitCost: 500, totalCost: 500 },
        { item: 'Site Barricading & Footpath Cleaning', category: 'overhead', quantity: '1 Job', unitCost: 400, totalCost: 400 },
      ];
      const mat = 4400;
      const mach = 500;
      const ovh = 400;
      return {
        budget: labor + mat + mach + ovh, // ₹7,000
        materialCost: mat,
        laborCost: labor,
        machineryCost: mach,
        overheadCost: ovh,
        workersCount: workers,
        estimatedDays: days,
        dailyWagePerWorker: STANDARD_DAILY_WAGE,
        defectDimensions: customDimensions || 'Estimated 4.0 m² broken pedestrian paver block walkway',
        description: 'Public route footpath restoration & paver block repair',
        breakdown: items,
      };
    }

    if (sev === 'HIGH') {
      const workers = 5;
      const days = 3;
      const labor = workers * days * STANDARD_DAILY_WAGE; // ₹12,750
      const items: PracticalBudgetItem[] = [
        { item: 'Heavy-Duty M35 Paver Blocks (30 m²)', category: 'material', quantity: '30 m²', unitCost: 620, totalCost: 18600 },
        { item: 'RCC M25 Culvert Slab & Structural Reinforcement (1.5 m³)', category: 'material', quantity: '1.5 m³', unitCost: 5500, totalCost: 8250 },
        { item: 'Precast RCC Edge Kerb Stones (20 units × 500mm)', category: 'material', quantity: '20 units', unitCost: 450, totalCost: 9000 },
        { item: 'Granular Sub-Base (GSB) Base Aggregate & Sand Cushion', category: 'material', quantity: '2.5 MT', unitCost: 1200, totalCost: 3000 },
        { item: `PWD Structural Infrastructure Crew (${workers} workers × ${days} days)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
        { item: 'Vibratory Plate Roller, Concrete Mixer & Tipper Truck', category: 'machinery', quantity: '3 Days', unitCost: 1583, totalCost: 4750 },
        { item: 'PWD Assistant Engineer Inspection & Safety Diversion', category: 'overhead', quantity: '1 Job', unitCost: 2000, totalCost: 2000 },
      ];
      const mat = 38850;
      const mach = 4750;
      const ovh = 2000;
      return {
        budget: 40000, // Normalized to ₹40,000
        materialCost: 20500,
        laborCost: labor,
        machineryCost: 4750,
        overheadCost: 2000,
        workersCount: workers,
        estimatedDays: days,
        dailyWagePerWorker: STANDARD_DAILY_WAGE,
        defectDimensions: customDimensions || 'Estimated 30.0 m² collapsed public corridor walkway & broken RCC culvert slab',
        description: 'Public corridor structural reconstruction & storm culvert restoration',
        breakdown: items,
      };
    }

    // MEDIUM severity (Default PWD Route)
    const workers = 3;
    const days = 2;
    const labor = workers * days * STANDARD_DAILY_WAGE; // ₹5,100
    const items: PracticalBudgetItem[] = [
      { item: 'Heavy-Duty Zig-Zag M30 Paver Blocks 60mm (12 m²)', category: 'material', quantity: '12 m²', unitCost: 580, totalCost: 6960 },
      { item: 'Screened Washed River Sand Bedding (1.0 m³)', category: 'material', quantity: '1.0 m³', unitCost: 2500, totalCost: 2500 },
      { item: 'Pre-cast Kerb Stones (10 units × 500mm)', category: 'material', quantity: '10 units', unitCost: 450, totalCost: 4500 },
      { item: 'M20 Grade Bonding Cement Mortar', category: 'material', quantity: '3 Bags', unitCost: 480, totalCost: 1440 },
      { item: `Public Route Pavement Crew (${workers} workers × ${days} days @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
      { item: 'Plate Compactor & Block Cutter Tool Rental', category: 'machinery', quantity: '2 Days', unitCost: 1200, totalCost: 2400 },
      { item: 'Pedestrian Corridor Signs & Traffic Cones', category: 'overhead', quantity: '1 Job', unitCost: 1000, totalCost: 1000 },
    ];
    const mat = 11500;
    const mach = 2400;
    const ovh = 1000;
    return {
      budget: 20000, // ₹20,000
      materialCost: mat,
      laborCost: labor,
      machineryCost: mach,
      overheadCost: ovh,
      workersCount: workers,
      estimatedDays: days,
      dailyWagePerWorker: STANDARD_DAILY_WAGE,
      defectDimensions: customDimensions || 'Estimated 12.0 m² public route pavement & kerbstone restoration',
      description: 'Public route pavement resurfacing & kerbstone restoration',
      breakdown: items,
    };
  }

  // 10. Missing Signage & Signals
  if (norm.includes('sign') || norm.includes('signal')) {
    if (sev === 'LOW') {
      const workers = 2;
      const days = 1;
      const labor = workers * days * STANDARD_DAILY_WAGE; // ₹1,700
      const items: PracticalBudgetItem[] = [
        { item: 'Microprismatic Retro-Reflective Sign Sheet (Type IV)', category: 'material', quantity: '1 Unit', unitCost: 2400, totalCost: 2400 },
        { item: 'Galvanized Mounting Brackets & Anchor Bolts', category: 'material', quantity: '1 Set', unitCost: 700, totalCost: 700 },
        { item: 'M20 Concrete Foundation Mortar (1 bag)', category: 'material', quantity: '50 kg', unitCost: 400, totalCost: 400 },
        { item: `Signpost Technicians (${workers} workers × ${days} day @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
        { item: 'Portable Core Drill & Torque Tools', category: 'machinery', quantity: '1 Day', unitCost: 500, totalCost: 500 },
        { item: 'Site Safety Cones', category: 'overhead', quantity: '1 Job', unitCost: 300, totalCost: 300 },
      ];
      const mat = 3500;
      const mach = 500;
      const ovh = 300;
      return {
        budget: labor + mat + mach + ovh, // ₹6,000
        materialCost: mat,
        laborCost: labor,
        machineryCost: mach,
        overheadCost: ovh,
        workersCount: workers,
        estimatedDays: days,
        dailyWagePerWorker: STANDARD_DAILY_WAGE,
        defectDimensions: customDimensions || '1 retro-reflective caution signboard bent / loose mounting',
        description: 'Retro-reflective caution sign mounting & pole straightening',
        breakdown: items,
      };
    }

    if (sev === 'HIGH') {
      const workers = 4;
      const days = 3;
      const labor = workers * days * STANDARD_DAILY_WAGE; // ₹10,200
      const items: PracticalBudgetItem[] = [
        { item: 'Structural Galvanized Cantilever Gantry Arm (6m reach)', category: 'material', quantity: '1 Unit', unitCost: 22000, totalCost: 22000 },
        { item: 'High-Intensity Retro-Reflective Overhead Signboard (3×1.5m)', category: 'material', quantity: '1 Unit', unitCost: 14500, totalCost: 14500 },
        { item: 'RCC M25 Foundation Anchor Cage & 4×M30 Bolts', category: 'material', quantity: '1 Set', unitCost: 6800, totalCost: 6800 },
        { item: 'LED Warning Strobe Optic Unit & Flasher Circuit', category: 'material', quantity: '1 Unit', unitCost: 4200, totalCost: 4200 },
        { item: `Traffic Signals Crew (${workers} workers × ${days} days @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
        { item: 'Mobile Boom Crane (1 Shift) & Core Drill Machine', category: 'machinery', quantity: '3 Days', unitCost: 2166, totalCost: 6500 },
        { item: 'Traffic Safety Marshaling & Structural Engineer Sign-Off', category: 'overhead', quantity: '1 Job', unitCost: 2800, totalCost: 2800 },
      ];
      const mat = 47500;
      const mach = 6500;
      const ovh = 2800;
      return {
        budget: labor + mat + mach + ovh, // ₹67,000
        materialCost: mat,
        laborCost: labor,
        machineryCost: mach,
        overheadCost: ovh,
        workersCount: workers,
        estimatedDays: days,
        dailyWagePerWorker: STANDARD_DAILY_WAGE,
        defectDimensions: customDimensions || 'Overhead cantilever gantry traffic signboard / signal optic unit replacement',
        description: 'Overhead cantilever gantry sign / traffic signal optic unit replacement',
        breakdown: items,
      };
    }

    // MEDIUM severity (Default Signage)
    const workers = 3;
    const days = 2;
    const labor = workers * days * STANDARD_DAILY_WAGE; // ₹5,100
    const items: PracticalBudgetItem[] = [
      { item: '900mm Type XI Retro-Reflective Aluminium Signboard', category: 'material', quantity: '1 Unit', unitCost: 7200, totalCost: 7200 },
      { item: '3-Meter Hot-Dip Galvanized Steel Post (75mm NB)', category: 'material', quantity: '1 Unit', unitCost: 3800, totalCost: 3800 },
      { item: 'RCC M20 Grade Concrete Foundation Bed (0.3 m³)', category: 'material', quantity: '0.3 m³', unitCost: 5333, totalCost: 1600 },
      { item: `Signage Installation Technicians (${workers} workers × ${days} days @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
      { item: 'Earth Auger Hole Digger & Utility Transit Vehicle', category: 'machinery', quantity: '2 Days', unitCost: 750, totalCost: 1500 },
      { item: 'Traffic Warning Barricades & Site Cleanup', category: 'overhead', quantity: '1 Job', unitCost: 800, totalCost: 800 },
    ];
    const mat = 12600;
    const mach = 1500;
    const ovh = 800;
    return {
      budget: labor + mat + mach + ovh, // ₹20,000
      materialCost: mat,
      laborCost: labor,
      machineryCost: mach,
      overheadCost: ovh,
      workersCount: workers,
      estimatedDays: days,
      dailyWagePerWorker: STANDARD_DAILY_WAGE,
      defectDimensions: customDimensions || '1 major intersection regulatory signboard (900mm dia) damaged',
      description: 'High-intensity microprismatic signboard installation & warning beacon repair',
      breakdown: items,
    };
  }

  // 11. General / Standard Fallback
  if (sev === 'LOW') {
    const workers = 2;
    const days = 1;
    const labor = workers * days * STANDARD_DAILY_WAGE; // ₹1,700
    const mat = 4500;
    const mach = 800;
    const ovh = 500;
    const items: PracticalBudgetItem[] = [
      { item: 'Surface Repair Mortar & Restoration Materials', category: 'material', quantity: '1 Lot', unitCost: 4500, totalCost: 4500 },
      { item: `Municipal Repair Labor (${workers} workers × ${days} day @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
      { item: 'Equipment & Hand Tool Rental', category: 'machinery', quantity: '1 Day', unitCost: 800, totalCost: 800 },
      { item: 'Site Safety Barricades & Cleanup', category: 'overhead', quantity: '1 Job', unitCost: 500, totalCost: 500 },
    ];
    return {
      budget: labor + mat + mach + ovh, // ₹7,500
      materialCost: mat,
      laborCost: labor,
      machineryCost: mach,
      overheadCost: ovh,
      workersCount: workers,
      estimatedDays: days,
      dailyWagePerWorker: STANDARD_DAILY_WAGE,
      defectDimensions: customDimensions || 'Minor civic surface defect',
      description: 'Minor civic infrastructure surface repair',
      breakdown: items,
    };
  }

  if (sev === 'HIGH') {
    const workers = 5;
    const days = 3;
    const labor = workers * days * STANDARD_DAILY_WAGE; // ₹12,750
    const mat = 28250;
    const mach = 6000;
    const ovh = 3000;
    const items: PracticalBudgetItem[] = [
      { item: 'Structural Materials, Concrete & High-Strength Components', category: 'material', quantity: '1 Lot', unitCost: 28250, totalCost: 28250 },
      { item: `Civic Infrastructure Crew (${workers} workers × ${days} days @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
      { item: 'Excavator, Heavy Compactor & Transit Machinery', category: 'machinery', quantity: '3 Days', unitCost: 2000, totalCost: 6000 },
      { item: 'Municipal Supervision & Public Safety Marshals', category: 'overhead', quantity: '1 Job', unitCost: 3000, totalCost: 3000 },
    ];
    return {
      budget: labor + mat + mach + ovh, // ₹50,000
      materialCost: mat,
      laborCost: labor,
      machineryCost: mach,
      overheadCost: ovh,
      workersCount: workers,
      estimatedDays: days,
      dailyWagePerWorker: STANDARD_DAILY_WAGE,
      defectDimensions: customDimensions || 'Extensive structural civic infrastructure failure',
      description: 'Major structural reconstruction & department intervention',
      breakdown: items,
    };
  }

  // MEDIUM severity default
  const workers = 3;
  const days = 2;
  const labor = workers * days * STANDARD_DAILY_WAGE; // ₹5,100
  const mat = 13500;
  const mach = 2200;
  const ovh = 1200;
  const items: PracticalBudgetItem[] = [
    { item: 'Pavement Repair Materials & Replacement Components', category: 'material', quantity: '1 Lot', unitCost: 13500, totalCost: 13500 },
    { item: `Municipal Repair Crew (${workers} workers × ${days} days @ ₹${STANDARD_DAILY_WAGE}/day)`, category: 'labor', quantity: `${workers * days} person-days`, unitCost: STANDARD_DAILY_WAGE, totalCost: labor },
    { item: 'Vibratory Compactor & Cutting Equipment', category: 'machinery', quantity: '2 Days', unitCost: 1100, totalCost: 2200 },
    { item: 'Traffic Safety Marshals & Supervision', category: 'overhead', quantity: '1 Job', unitCost: 1200, totalCost: 1200 },
  ];
  return {
    budget: labor + mat + mach + ovh, // ₹22,000
    materialCost: mat,
    laborCost: labor,
    machineryCost: mach,
    overheadCost: ovh,
    workersCount: workers,
    estimatedDays: days,
    dailyWagePerWorker: STANDARD_DAILY_WAGE,
    defectDimensions: customDimensions || 'Standard civic defect & pavement failure',
    description: 'Standard municipal restoration work & compaction',
    breakdown: items,
  };
}

/**
 * Automatically splits any custom budget entered by the field inspector into standard defensible municipal road repair cost components:
 * 1. Material Cost (45%): Bituminous hot mix / concrete / GSB aggregate / tack coat / pavers
 * 2. Labour Charge (30%): Road repair crew & compaction operators (@ standard municipal wage)
 * 3. Safety & Machinery Equipment (15%): Compactor, diamond saw cutter, roller, barricades
 * 4. Overhead & Contingency Expenses (10%): Transport, safety traffic management, supervisor sign-off
 */
export function autoSplitBudget(
  totalBudget: number,
  issueType: string = 'pothole',
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | string = 'MEDIUM'
): PracticalBudgetDetails {
  const amount = Math.max(1000, Math.round(Number(totalBudget) || 25000));
  const norm = (issueType || 'pothole').toLowerCase();
  const sev = (severity || 'MEDIUM').toUpperCase();

  // Percentage splits: 45% Materials, 30% Labour, 15% Machinery & Safety Gear, 10% Overheads & Contingency
  const materialCost = Math.round(amount * 0.45);
  const laborCost = Math.round(amount * 0.30);
  const machineryCost = Math.round(amount * 0.15);
  const overheadCost = amount - (materialCost + laborCost + machineryCost); // Exact remainder to match 100%

  const dailyWage = STANDARD_DAILY_WAGE; // ₹850/day
  const totalPersonDays = Math.max(1, Math.round(laborCost / dailyWage));
  const estimatedDays = sev === 'HIGH' ? Math.min(7, Math.max(3, Math.ceil(totalPersonDays / 4))) : sev === 'LOW' ? 1 : 2;
  const workersCount = Math.max(1, Math.ceil(totalPersonDays / estimatedDays));

  // Determine descriptive labels based on issue class
  let materialDesc = 'Bituminous hot-mix asphalt, prime tack coat & stone aggregates';
  let machineryDesc = 'Vibratory plate compactor, diamond asphalt saw & roller rental';
  let laborDesc = `Civic road repair crew (${workersCount} workers × ${estimatedDays} days)`;

  if (norm.includes('manhole') || norm.includes('drain')) {
    materialDesc = 'Heavy-duty ductile iron Class D400 frame, M30 grade concrete & bonding agent';
    machineryDesc = 'Jackhammer, hydraulic cutter & concrete mixer';
  } else if (norm.includes('waterlog')) {
    materialDesc = 'Perforated storm drain pipes, catchpit grating & gravel filter';
    machineryDesc = 'Suction jetting tanker & mini excavator rental';
  } else if (norm.includes('crack')) {
    materialDesc = 'Hot-pour rubberized bitumen crack sealant & primer coat';
    machineryDesc = 'Hot air lance, joint router machine & safety gear';
  } else if (norm.includes('divider') || norm.includes('footpath')) {
    materialDesc = 'Precast concrete curb kerbs, interlocking pavers & yellow/black paint';
    machineryDesc = 'Concrete vibrator, plate compactor & edge cutting tools';
  }

  const items: PracticalBudgetItem[] = [
    {
      item: `Material Cost (45%): ${materialDesc}`,
      category: 'material',
      quantity: '45% of scope',
      unitCost: materialCost,
      totalCost: materialCost,
    },
    {
      item: `Labour Charge (30%): ${laborDesc} @ ₹${dailyWage}/day`,
      category: 'labor',
      quantity: `${totalPersonDays} person-days`,
      unitCost: dailyWage,
      totalCost: laborCost,
    },
    {
      item: `Machinery & Safety Equipment (15%): ${machineryDesc}`,
      category: 'machinery',
      quantity: `${estimatedDays} Days`,
      unitCost: machineryCost,
      totalCost: machineryCost,
    },
    {
      item: 'Safety, Traffic Management & Overhead Expenses (10%)',
      category: 'overhead',
      quantity: '1 Job',
      unitCost: overheadCost,
      totalCost: overheadCost,
    },
  ];

  return {
    budget: amount,
    materialCost,
    laborCost,
    machineryCost,
    overheadCost,
    workersCount,
    estimatedDays,
    dailyWagePerWorker: dailyWage,
    defectDimensions: `Custom physical field estimate for ${issueType} (${severity})`,
    description: `${materialDesc}, ${laborDesc}, equipment deployment & safety traffic diversion`,
    breakdown: items,
  };
}

/**
 * Standard fixed INR municipal budget calculation based on issue type and severity.
 * Backward-compatible helper that delegates to calculatePracticalBudget.
 */
export function getStandardEstimatedBudget(
  issueType: string,
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | string = 'MEDIUM'
): {
  budget: number;
  description: string;
  materialCost: number;
  laborCost: number;
  machineryCost: number;
  overheadCost: number;
  workersCount: number;
  estimatedDays: number;
  dailyWagePerWorker: number;
  defectDimensions: string;
  breakdown: PracticalBudgetItem[];
} {
  const practical = calculatePracticalBudget(issueType, severity);
  return {
    budget: practical.budget,
    description: practical.description,
    materialCost: practical.materialCost,
    laborCost: practical.laborCost,
    machineryCost: practical.machineryCost,
    overheadCost: practical.overheadCost,
    workersCount: practical.workersCount,
    estimatedDays: practical.estimatedDays,
    dailyWagePerWorker: practical.dailyWagePerWorker,
    defectDimensions: practical.defectDimensions,
    breakdown: practical.breakdown,
  };
}

/**
 * Verify whether GPS coordinates are within the designated Coimbatore project boundaries.
 */
export function isLocationWithinCoimbatoreRegions(latitude: number, longitude: number): {
  isValid: boolean;
  matchedRegion: CoimbatoreRegion;
  distanceKm: number;
} {
  const matched = matchRoadByCoordinates(latitude, longitude);
  // Valid if within reasonable distance (< 15km) of a Coimbatore catalog road
  const isValid = matched.distanceKm <= 15.0;
  return {
    isValid,
    matchedRegion: matched.region,
    distanceKm: matched.distanceKm,
  };
}

