// Centralized ONNX detection configuration.
// Change thresholds here — nowhere else in the codebase.

// Minimum confidence to accept a detection (configurable threshold)
export const DETECTION_THRESHOLD = 0.25; 

// IoU overlap threshold for Non-Maximum Suppression (NMS)
export const IOU_THRESHOLD = 0.45;

// Road presence validation thresholds
export const ROAD_VALIDATION_THRESHOLD = 0.45;  // minimum score to consider image a road scene
export const ROAD_SAMPLE_SIZE = 64;              // image is downsampled to this for fast heuristic analysis

export type DetectedIssueType =
  | 'alligator cracking'
  | 'cracking'
  | 'pothole'
  | 'manhole defect'
  | 'waterlogging'
  | 'road divider damage'
  | 'damaged traffic sign'
  | 'street light fault'
  | 'debris / road blockage'
  | 'damaged footpath'
  | 'missing signage'
  | 'no_major_issue';

export type Priority = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

// YOLO model input dimensions (must match training config)
export const MODEL_INPUT_WIDTH = 640;
export const MODEL_INPUT_HEIGHT = 640;

export interface PriorityEvaluation {
  priority: Priority;
  reason: string;
}

/**
 * Calculates priority and severity with human-readable municipal reason.
 * Evaluates:
 * 1. Validated issue type
 * 2. Visible evidence (bounding box area, detection count)
 * 3. Description safety hazard context (swerve, collision, depth, pedestrian risk, active lane)
 * 4. Never lets confidence alone determine priority.
 */
export function calculatePriorityWithExplanation(
  issueType: DetectedIssueType | string,
  confidence: number,
  boundingBox?: { width: number; height: number },
  detectionCount = 1,
  description?: string
): PriorityEvaluation {
  if (!issueType || issueType === 'no_major_issue' || issueType.includes('Invalid') || issueType.includes('unclear')) {
    return { priority: 'NONE', reason: 'None: No active infrastructure defect reported' };
  }

  const normType = issueType.trim().toLowerCase();
  const desc = (description || '').toLowerCase();
  const area = boundingBox ? boundingBox.width * boundingBox.height : 0;

  // Safety risk keywords from citizen description
  const hasUrgentHazard =
    desc.includes('deep') ||
    desc.includes('crater') ||
    desc.includes('swerve') ||
    desc.includes('accident') ||
    desc.includes('crash') ||
    desc.includes('collision') ||
    desc.includes('danger') ||
    desc.includes('hazardous') ||
    desc.includes('severe') ||
    desc.includes('active lane') ||
    desc.includes('traffic lane') ||
    desc.includes('two-wheeler') ||
    desc.includes('two wheeler') ||
    desc.includes('bike') ||
    desc.includes('pedestrian') ||
    desc.includes('school') ||
    desc.includes('hospital') ||
    desc.includes('pieces') ||
    desc.includes('blocking');

  const hasMinorKeywords =
    desc.includes('minor') ||
    desc.includes('hairline') ||
    desc.includes('small') ||
    desc.includes('slight') ||
    desc.includes('superficial') ||
    desc.includes('cosmetic') ||
    desc.includes('low risk') ||
    desc.includes('early');

  // Explicit Minor Override (Confidence alone must NEVER force High)
  if (hasMinorKeywords && area < 0.04) {
    return {
      priority: 'LOW',
      reason: 'Low: Minor defect reported with limited immediate safety risk to road users',
    };
  }

  // Potholes: High urgency vehicular & two-wheeler safety hazard
  if (normType === 'pothole') {
    if (area >= 0.08 || hasUrgentHazard || detectionCount > 2) {
      return {
        priority: 'HIGH',
        reason: 'High: Deep or large pothole crater creating an immediate vehicular/two-wheeler accident hazard',
      };
    }
    if (area >= 0.02 || desc.includes('repair') || detectionCount > 1) {
      return {
        priority: 'MEDIUM',
        reason: 'Medium: Moderate pothole affecting road surface smoothness, requiring municipal asphalt repair',
      };
    }
    return {
      priority: 'LOW',
      reason: 'Low: Shallow surface pothole with low immediate accident risk',
    };
  }

  // Alligator Cracking: Structural base failure
  if (normType === 'alligator cracking') {
    if (area >= 0.10 || hasUrgentHazard || detectionCount > 2) {
      return {
        priority: 'HIGH',
        reason: 'High: Severe interconnected alligator cracking indicating structural road base failure',
      };
    }
    if (area >= 0.03 || desc.includes('spread') || desc.includes('growing')) {
      return {
        priority: 'MEDIUM',
        reason: 'Medium: Moderate fatigue cracking requiring scheduled surface re-laying',
      };
    }
    return {
      priority: 'LOW',
      reason: 'Low: Initial alligator cracking pattern with low immediate traffic hazard',
    };
  }

  // Cracking: Longitudinal and Transverse cracks
  if (normType === 'cracking' || normType === 'road cracking' || normType === 'road surface cracking') {
    if (area >= 0.12 || hasUrgentHazard || detectionCount > 3) {
      return {
        priority: 'HIGH',
        reason: 'High: Extensive pavement fissures spreading across the active vehicular carriageway',
      };
    }
    if (area >= 0.03 || desc.includes('long') || detectionCount > 1) {
      return {
        priority: 'MEDIUM',
        reason: 'Medium: Longitudinal/transverse road surface cracks requiring crack sealing',
      };
    }
    return {
      priority: 'LOW',
      reason: 'Low: Minor hairline road surface cracking with minimal structural risk',
    };
  }

  // Road Divider / Median Damage: Major collision hazard
  if (normType.includes('divider') || normType.includes('median')) {
    if (hasUrgentHazard || area >= 0.06 || desc.includes('broken pieces') || desc.includes('road')) {
      return {
        priority: 'HIGH',
        reason: 'High: Fractured road divider with debris or broken concrete posing direct vehicular collision hazard',
      };
    }
    return {
      priority: 'MEDIUM',
      reason: 'Medium: Damaged road divider structure requiring civil maintenance',
    };
  }

  // Manhole Defect: Severe falling & vehicle inversion hazard
  if (normType.includes('manhole')) {
    return {
      priority: 'HIGH',
      reason: 'High: Damaged, displaced, or missing manhole cover creating immediate catastrophic fall/inversion hazard',
    };
  }

  // Waterlogging: Hydroplaning & base erosion
  if (normType.includes('waterlog') || normType.includes('flood')) {
    if (hasUrgentHazard || area >= 0.10 || desc.includes('stagnant') || desc.includes('submerged')) {
      return {
        priority: 'HIGH',
        reason: 'High: Deep stagnant waterlogging across carriageway causing hydroplaning risk and major traffic obstruction',
      };
    }
    return {
      priority: 'MEDIUM',
      reason: 'Medium: Water accumulation on road margin affecting traffic usability',
    };
  }

  // Street Light Fault: Night vision & collision hazard
  if (normType.includes('street light') || normType.includes('streetlight') || normType.includes('lighting')) {
    if (hasUrgentHazard || desc.includes('junction') || desc.includes('intersection') || desc.includes('pitch dark')) {
      return {
        priority: 'HIGH',
        reason: 'High: Streetlight outage at major junction/curve causing severe nighttime collision hazard',
      };
    }
    return {
      priority: 'MEDIUM',
      reason: 'Medium: Non-functional streetlight fixture requiring electrical maintenance',
    };
  }

  // Debris / Road Blockage: Immediate road obstacle
  if (normType.includes('debris') || normType.includes('blockage') || normType.includes('obstacle')) {
    if (hasUrgentHazard || area >= 0.08 || desc.includes('blocking')) {
      return {
        priority: 'HIGH',
        reason: 'High: Heavy debris or construction waste actively obstructing traffic movement',
      };
    }
    return {
      priority: 'MEDIUM',
      reason: 'Medium: Roadside debris accumulation requiring solid waste clearance',
    };
  }

  // Damaged Traffic Sign: Regulatory guidance
  if (normType.includes('sign') || normType.includes('signage')) {
    if (desc.includes('stop') || desc.includes('speed') || desc.includes('school') || desc.includes('blind')) {
      return {
        priority: 'MEDIUM',
        reason: 'Medium: Critical regulatory/warning traffic sign damaged or missing',
      };
    }
    return {
      priority: 'LOW',
      reason: 'Low: Information/direction sign damaged with low immediate safety risk',
    };
  }

  // Damaged Footpath: Pedestrian safety
  if (normType.includes('footpath') || normType.includes('walkway') || normType.includes('pavement')) {
    if (hasUrgentHazard || desc.includes('elderly') || desc.includes('trip') || desc.includes('fall')) {
      return {
        priority: 'MEDIUM',
        reason: 'Medium: Broken footpath slabs posing pedestrian trip and injury risk',
      };
    }
    return {
      priority: 'LOW',
      reason: 'Low: Minor footpath surface wear without open holes',
    };
  }

  return {
    priority: hasUrgentHazard ? 'HIGH' : 'LOW',
    reason: hasUrgentHazard
      ? 'High: Reported hazard context indicates urgent municipal attention required'
      : 'Low: Civic infrastructure defect with low immediate public safety hazard',
  };
}

export function calculatePriority(
  issueType: DetectedIssueType | string,
  confidence: number,
  boundingBox?: { width: number; height: number },
  detectionCount = 1,
  description?: string
): Priority {
  return calculatePriorityWithExplanation(issueType, confidence, boundingBox, detectionCount, description).priority;
}

// Map ONNX model class IDs to issue type strings (10-Class Target Taxonomy)
export const CLASS_ID_MAP: Record<number, DetectedIssueType> = {
  0: 'alligator cracking',
  1: 'cracking',
  2: 'pothole',
  3: 'manhole defect',
  4: 'waterlogging',
  5: 'road divider damage',
  6: 'damaged traffic sign',
  7: 'street light fault',
  8: 'debris / road blockage',
  9: 'damaged footpath',
};

// Department routing for all detected road & infrastructure issue types
export const ISSUE_DEPARTMENT: Record<DetectedIssueType, { name: string; code: string; secondary?: string }> = {
  'pothole': {
    name: 'Road Maintenance Department',
    code: 'ROAD',
    secondary: 'CCMC Road Maintenance Wing',
  },
  'alligator cracking': {
    name: 'Road Maintenance Department',
    code: 'ROAD',
    secondary: 'State Highways (C&M) Division',
  },
  'cracking': {
    name: 'Road Maintenance Department',
    code: 'ROAD',
    secondary: 'Zonal Engineering Wing',
  },
  'road divider damage': {
    name: 'Traffic / Road Safety Department',
    code: 'SAFETY',
    secondary: 'Coimbatore City Traffic Police',
  },
  'street light fault': {
    name: 'Street Lighting Department',
    code: 'LIGHTING',
    secondary: 'TANGEDCO & CCMC Street Lighting Wing',
  },
  'manhole defect': {
    name: 'Sewerage',
    code: 'SEWER',
    secondary: 'Underground Drainage (UGD) Division',
  },
  'waterlogging': {
    name: 'Stormwater / Drainage',
    code: 'DRAIN',
    secondary: 'Stormwater Drainage & Flood Control',
  },
  'debris / road blockage': {
    name: 'Solid Waste Management',
    code: 'SWM',
    secondary: 'Health & Sanitation Wing',
  },
  'damaged traffic sign': {
    name: 'Traffic / Road Safety Department',
    code: 'SAFETY',
    secondary: 'Highways Safety Cell',
  },
  'damaged footpath': {
    name: 'Public Works Department',
    code: 'PWD',
    secondary: 'Pedestrian Infrastructure Wing',
  },
  'missing signage': {
    name: 'Traffic / Road Safety Department',
    code: 'SAFETY',
    secondary: 'Highways Safety Cell',
  },
  'no_major_issue': {
    name: 'Road Maintenance Department',
    code: 'ROAD',
  },
};

export interface VisibleIssueMetadata {
  id: DetectedIssueType;
  title: string;
  category: string;
  department: string;
  departmentCode: string;
  defaultPriority: Priority;
  description: string;
  detectionFeatures: string[];
}

export const VISIBLE_ISSUES_METADATA: VisibleIssueMetadata[] = [
  {
    id: 'pothole',
    title: 'Pothole',
    category: 'Pavement Surface Failure',
    department: 'Road Maintenance Department',
    departmentCode: 'ROAD',
    defaultPriority: 'HIGH',
    description: 'Depression or cavity in asphalt surface exposing sub-base layers.',
    detectionFeatures: ['Dark concave depression', 'Irregular sharp asphalt rim', 'Shadow depth variation'],
  },
  {
    id: 'alligator cracking',
    title: 'Alligator Cracking',
    category: 'Structural Base Fatigue',
    department: 'Road Maintenance Department',
    departmentCode: 'ROAD',
    defaultPriority: 'HIGH',
    description: 'Interconnected hexagonal crack pattern resembling reptile skin caused by base failure.',
    detectionFeatures: ['Multi-directional interconnected grid', 'Polygonal asphalt blocks', 'Subgrade saturation marks'],
  },
  {
    id: 'cracking',
    title: 'Linear & Transverse Cracks',
    category: 'Pavement Surface Defect',
    department: 'Road Maintenance Department',
    departmentCode: 'ROAD',
    defaultPriority: 'MEDIUM',
    description: 'Longitudinal or transverse fissures along thermal joints and wheel paths.',
    detectionFeatures: ['Continuous narrow fissures', 'Edge raveling', 'Centerline seam degradation'],
  },
  {
    id: 'manhole defect',
    title: 'Damaged / Open Manhole Chamber',
    category: 'Sub-surface Utility Hazard',
    department: 'Sewerage',
    departmentCode: 'SEWER',
    defaultPriority: 'HIGH',
    description: 'Missing, broken, or sunken drainage/sewer manhole lid directly in travel lane.',
    detectionFeatures: ['Circular/square frame gap', 'Cracked iron lid', 'Deep hazardous utility void'],
  },
  {
    id: 'waterlogging',
    title: 'Waterlogging & Road Flooding',
    category: 'Drainage & Hydrology',
    department: 'Stormwater / Drainage',
    departmentCode: 'DRAIN',
    defaultPriority: 'HIGH',
    description: 'Stagnant rainwater pool obstructing vehicular lanes due to choked catchpits.',
    detectionFeatures: ['Surface water reflections', 'Submerged road markings', 'Silt accumulation'],
  },
  {
    id: 'road divider damage',
    title: 'Damaged Road Divider / Median',
    category: 'Traffic & Roadway Barrier',
    department: 'Traffic / Road Safety Department',
    departmentCode: 'SAFETY',
    defaultPriority: 'HIGH',
    description: 'Displaced concrete median blocks, bent crash barriers, or missing divider reflectors.',
    detectionFeatures: ['Fractured concrete kerbs', 'Misaligned median blocks', 'Missing warning reflectors'],
  },
  {
    id: 'damaged traffic sign',
    title: 'Damaged Traffic Sign / Bare Post',
    category: 'Traffic Safety & Guidance',
    department: 'Traffic / Road Safety Department',
    departmentCode: 'SAFETY',
    defaultPriority: 'MEDIUM',
    description: 'Bent or vandalized caution/speed limit signs, obscured placards, or bare signposts.',
    detectionFeatures: ['Bent signage pole', 'Faded warning boards', 'Damaged optical signal lens'],
  },
  {
    id: 'street light fault',
    title: 'Street Light Fault / Damaged Pole',
    category: 'Electrical & Night Road Safety',
    department: 'Street Lighting Department',
    departmentCode: 'LIGHTING',
    defaultPriority: 'HIGH',
    description: 'Damaged streetlight pole, dangling electrical cables, or non-functioning luminaire.',
    detectionFeatures: ['Bent lamp post', 'Exposed junction box', 'Extinguished overhead fixture'],
  },
  {
    id: 'debris / road blockage',
    title: 'Debris & Road Obstruction',
    category: 'Sanitation & Obstacle Clearance',
    department: 'Solid Waste Management Department',
    departmentCode: 'SWM',
    defaultPriority: 'MEDIUM',
    description: 'Fallen tree limbs, construction gravel dumps, or abandoned debris blocking traffic.',
    detectionFeatures: ['Unorganized rubble pile', 'Fallen vegetation', 'Illegal aggregate dumps'],
  },
  {
    id: 'damaged footpath',
    title: 'Damaged Footpath / Walkway',
    category: 'Pedestrian Infrastructure',
    department: 'Public Works Department',
    departmentCode: 'PWD',
    defaultPriority: 'MEDIUM',
    description: 'Broken concrete pavers, missing sidewalk slabs, or uneven pedestrian corridor.',
    detectionFeatures: ['Fractured paver blocks', 'Exposed sub-base rubble', 'Uneven walking surface'],
  },
  {
    id: 'missing signage',
    title: 'Missing Traffic Sign / Signal Fault',
    category: 'Traffic Safety & Guidance',
    department: 'Traffic / Road Safety Department',
    departmentCode: 'SAFETY',
    defaultPriority: 'MEDIUM',
    description: 'Bent or missing speed limit, detour, or caution signs and non-operational traffic lights.',
    detectionFeatures: ['Bent signage pole', 'Faded warning boards', 'Damaged optical signal lens'],
  },
];



