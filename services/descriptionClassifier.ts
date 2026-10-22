import {
  classifyDepartmentFromDescription,
  type DepartmentClassificationResult,
} from './departmentMapping.ts';

export interface DescriptionClassificationResult {
  isRecognized: boolean;
  requiresClarification: boolean;
  issueCategory: string;
  displayIssueName: string;
  predictedClass: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  priorityReason: string;
  confidence: number;
  confidenceRaw: number;
  confidenceType: 'description_heuristic';
  department: string;
  departmentCode: string;
  routingStatus: string;
  routingMessage?: string;
  clarificationMessage?: string;
}

/**
 * Deterministically hashes a string to a positive 32-bit integer.
 */
function hashDescription(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Normalizes input text: converts to lowercase, collapses whitespace, trims.
 */
export function normalizeDescriptionText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s/'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks whether high-severity indicator terms are preceded by negation words
 * such as "not dangerous", "no hazard", "not a risk", etc.
 */
function hasActiveHighSeverityTerms(normalized: string): { hasHigh: boolean; matchedTerm?: string } {
  const highTerms = [
    'danger',
    'dangerous',
    'hazard',
    'hazardous',
    'risk',
    'risky',
    'major',
    'severe',
    'critical',
    'emergency',
    'accident',
    'crash',
    'collision',
    'injury',
    'bike fell',
    'fall risk',
  ];

  // Negation prefixes
  const negationRegex = /\b(not|no|never|without|hardly|scarcely|barely)\s+(a\s+|an\s+|any\s+)?(immediate\s+|real\s+|serious\s+)?(danger|dangerous|hazard|hazardous|risk|risky|major|severe|critical|emergency)\b/i;

  for (const term of highTerms) {
    const termRegex = new RegExp(`\\b${term}\\b`, 'i');
    if (termRegex.test(normalized)) {
      // Check if this occurrence is part of a negated phrase
      const negationMatches = normalized.match(negationRegex);
      if (negationMatches) {
        // If the entire text only mentions the term in a negated context
        const stripped = normalized.replace(negationRegex, '');
        if (!termRegex.test(stripped)) {
          // It was only present in negated form! Continue checking other terms.
          continue;
        }
      }
      return { hasHigh: true, matchedTerm: term };
    }
  }

  return { hasHigh: false };
}

/**
 * Checks for medium-severity indicators.
 */
function hasMediumSeverityTerms(normalized: string): { hasMedium: boolean; matchedTerm?: string } {
  const mediumTerms = [
    'medium',
    'moderate',
    'minor',
    'noticeable',
    'spreading',
    'repair needed',
    'repair required',
    'maintenance needed',
    'maintenance required',
    'surface cracking',
  ];

  for (const term of mediumTerms) {
    const regex = new RegExp(`\\b${term}\\b`, 'i');
    if (regex.test(normalized)) {
      return { hasMedium: true, matchedTerm: term };
    }
  }

  return { hasMedium: false };
}

/**
 * Category definitions based on citizen descriptions.
 */
interface CategoryDef {
  canonicalName: string;
  keywords: string[];
}

const CIVIC_CATEGORIES: CategoryDef[] = [
  {
    canonicalName: 'Pothole',
    keywords: [
      'pothole',
      'potholes',
      'crater',
      'pot hole',
      'pot holes',
      'hole in road',
      'hole in the road',
      'hole on road',
      'hole on the road',
      'road pit',
      'asphalt cavity',
    ],
  },
  {
    canonicalName: 'Road Crack',
    keywords: [
      'alligator cracking',
      'alligator crack',
      'crocodile crack',
      'spider crack',
      'road crack',
      'road cracks',
      'cracking',
      'cracked road',
      'cracks on road',
      'crack on road',
      'crack on the road',
      'cracks on the road',
      'fissure',
      'pavement crack',
      'asphalt crack',
      'surface crack',
      'long crack',
      'long cracks',
      'crack',
      'cracks',
    ],
  },
  {
    canonicalName: 'Waterlogging',
    keywords: [
      'waterlogging',
      'water logging',
      'waterlogged',
      'standing water',
      'stagnant water',
      'water is standing',
      'water standing',
      'water is accumulating',
      'water accumulating',
      'accumulating water',
      'water accumulation',
      'rainwater',
      'rain water',
      'flooded road',
      'road flooded',
      'flooding on road',
      'water puddle',
      'water puddles',
      'submerged road',
    ],
  },
  {
    canonicalName: 'Street Light Fault',
    keywords: [
      'street light',
      'streetlight',
      'street lights',
      'streetlights',
      'lamp post',
      'lamppost',
      'light pole',
      'light not working',
      'lights not working',
      'lamp not working',
      'dark street',
      'dangling electric wire',
      'exposed power cable',
    ],
  },
  {
    canonicalName: 'Damaged Manhole',
    keywords: [
      'manhole',
      'manholes',
      'man hole',
      'manhole cover',
      'broken manhole',
      'open manhole',
      'damaged manhole',
      'drain cover',
      'sewer cover',
    ],
  },
  {
    canonicalName: 'Garbage Overflow',
    keywords: [
      'garbage',
      'trash',
      'dustbin',
      'waste',
      'rubbish',
      'litter',
      'overflowing garbage',
      'garbage overflow',
      'overflowing dustbin',
      'uncollected waste',
      'garbage dump',
      'solid waste',
    ],
  },
  {
    canonicalName: 'Drainage Blockage',
    keywords: [
      'drainage blockage',
      'blocked drain',
      'drain is blocked',
      'drainage blocked',
      'clogged drain',
      'drain clogged',
      'drainage problem',
      'storm drain',
      'gutter blockage',
      'drain blockage',
      'drainage',
      'drain',
    ],
  },
  {
    canonicalName: 'Damaged Footpath',
    keywords: [
      'footpath',
      'footpaths',
      'sidewalk',
      'pedestrian walkway',
      'pedestrian path',
      'walkway',
      'paver block',
      'damaged footpath',
      'broken footpath',
    ],
  },
  {
    canonicalName: 'Road Divider Damage',
    keywords: [
      'road divider',
      'divider',
      'median barrier',
      'broken median',
      'damaged divider',
      'concrete median',
      'crash barrier',
    ],
  },
  {
    canonicalName: 'Damaged Traffic Sign',
    keywords: [
      'traffic sign',
      'signboard',
      'sign board',
      'speed limit sign',
      'damaged sign',
      'missing sign',
      'reflector broken',
    ],
  },
  {
    canonicalName: 'Sewerage Issue',
    keywords: [
      'sewage',
      'sewer',
      'sewage water',
      'sewage overflow',
      'sewer overflow',
      'sewage leak',
      'sewerage',
      'sewer line',
      'sewer pipe',
    ],
  },
  {
    canonicalName: 'Public Building Maintenance',
    keywords: [
      'government building',
      'public building',
      'municipal building',
      'community hall',
      'public toilet',
      'building damage',
      'building repair',
      'roof leak',
    ],
  },
  {
    canonicalName: 'Park Maintenance',
    keywords: [
      'playground',
      'park',
      'park bench',
      'park maintenance',
      'play area',
      'park damage',
    ],
  },
  {
    canonicalName: 'Tree Maintenance',
    keywords: [
      'tree',
      'trees',
      'fallen tree',
      'fallen branch',
      'tree branch',
      'broken branch',
      'overgrown branches',
      'uprooted tree',
    ],
  },
];

/**
 * Analyzes the citizen description to classify the civic defect, severity,
 * priority, and deterministic confidence score according to user specifications.
 */
export function classifyComplaintFromDescription(description: string): DescriptionClassificationResult {
  const normalized = normalizeDescriptionText(description);

  // 1. Check for empty or insufficient description
  if (!normalized || normalized.length < 3) {
    return {
      isRecognized: false,
      requiresClarification: true,
      issueCategory: 'Unspecified Issue',
      displayIssueName: 'Unspecified Issue',
      predictedClass: 'unspecified',
      severity: 'LOW',
      priority: 'LOW',
      priorityReason: 'Description is required to determine the issue category and severity.',
      confidence: 0,
      confidenceRaw: 0,
      confidenceType: 'description_heuristic',
      department: 'Road Maintenance',
      departmentCode: 'ROAD',
      routingStatus: 'Direct',
      clarificationMessage: 'Please provide a description of the civic issue (e.g. pothole, road crack, waterlogging).',
    };
  }

  // 2. Identify Issue Category from Description Keywords
  let matchedCategory: string | null = null;
  let highestKeywordLength = 0;

  for (const cat of CIVIC_CATEGORIES) {
    for (const kw of cat.keywords) {
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(normalized)) {
        if (kw.length > highestKeywordLength) {
          highestKeywordLength = kw.length;
          matchedCategory = cat.canonicalName;
        }
      }
    }
  }

  // If no category matched from CIVIC_CATEGORIES, query department routing for non-road categories
  const deptResult: DepartmentClassificationResult = classifyDepartmentFromDescription(description);

  if (!matchedCategory) {
    if (deptResult.departmentCode === 'PWD') {
      matchedCategory = normalized.includes('footpath') || normalized.includes('walkway')
        ? 'Damaged Footpath'
        : 'Public Route Issue';
    } else if (deptResult.departmentCode === 'LIGHTING') {
      matchedCategory = 'Street Light Fault';
    } else if (deptResult.departmentCode === 'SWM') {
      matchedCategory = 'Garbage Overflow';
    } else if (deptResult.departmentCode === 'DRAIN') {
      matchedCategory = normalized.includes('block') ? 'Drainage Blockage' : 'Waterlogging';
    } else if (deptResult.departmentCode === 'SEWER') {
      matchedCategory = 'Damaged Manhole';
    } else if (deptResult.departmentCode === 'SAFETY') {
      matchedCategory = 'Road Divider Damage';
    } else if (deptResult.departmentCode === 'BUILDING') {
      matchedCategory = 'Public Building Maintenance';
    } else if (deptResult.departmentCode === 'PARKS') {
      matchedCategory = 'Park Maintenance';
    } else if (deptResult.departmentCode === 'TREES') {
      matchedCategory = 'Tree Maintenance';
    }
  }

  // If still not recognized, ask for clarification
  if (!matchedCategory) {
    return {
      isRecognized: false,
      requiresClarification: true,
      issueCategory: 'Unclear Issue',
      displayIssueName: 'Unclear Issue',
      predictedClass: 'unclear_issue',
      severity: 'LOW',
      priority: 'LOW',
      priorityReason: 'The provided description does not match any recognized civic issue category.',
      confidence: 0,
      confidenceRaw: 0,
      confidenceType: 'description_heuristic',
      department: deptResult.department || 'Road Maintenance',
      departmentCode: deptResult.departmentCode || 'ROAD',
      routingStatus: deptResult.routingStatus || 'Direct',
      clarificationMessage: 'Could you please clarify the civic issue? Mention whether it is a pothole, road crack, waterlogging, streetlight fault, or another problem.',
    };
  }

  // 3. Determine Severity and Priority according to user specifications:
  // | Description indicators                                            | Severity / priority | Displayed confidence range |
  // | Risk, danger, hazard, or major                                    | HIGH                | 85%–100%                   |
  // | Medium or minor                                                   | MEDIUM              | 45%–85% (46%–84%)          |
  // | Small or straightforward mention without higher-severity indicator | LOW                 | 0%–45% (15%–45%)           |

  const { hasHigh, matchedTerm: highTerm } = hasActiveHighSeverityTerms(normalized);
  const { hasMedium, matchedTerm: medTerm } = hasMediumSeverityTerms(normalized);

  const hash = hashDescription(normalized);
  let severity: 'LOW' | 'MEDIUM' | 'HIGH';
  let priority: 'LOW' | 'MEDIUM' | 'HIGH';
  let priorityReason: string;
  let confidence: number;

  if (hasHigh) {
    severity = 'HIGH';
    priority = 'HIGH';
    priorityReason = `High: Urgent safety hazard or critical indicator ("${highTerm}") detected in description.`;
    // Range 85%–100% deterministically
    confidence = 85 + (hash % 16); // 85 to 100
  } else if (hasMedium) {
    severity = 'MEDIUM';
    priority = 'MEDIUM';
    priorityReason = `Medium: Moderate/minor severity indicator ("${medTerm}") detected; scheduled maintenance recommended.`;
    // Range 46%–84% deterministically (>45 and <85)
    confidence = 46 + (hash % 39); // 46 to 84
  } else {
    severity = 'LOW';
    priority = 'LOW';
    priorityReason = normalized.includes('small')
      ? 'Low: Small defect reported with minimal immediate traffic or safety risk.'
      : 'Low: Standard defect mention without higher-severity indicators.';
    // Range 15%–45% deterministically (0%–45%)
    confidence = 15 + (hash % 31); // 15 to 45
  }

  return {
    isRecognized: true,
    requiresClarification: false,
    issueCategory: matchedCategory,
    displayIssueName: matchedCategory,
    predictedClass: matchedCategory,
    severity,
    priority,
    priorityReason,
    confidence,
    confidenceRaw: confidence / 100,
    confidenceType: 'description_heuristic',
    department: deptResult.department || 'Road Maintenance',
    departmentCode: deptResult.departmentCode || 'ROAD',
    routingStatus: deptResult.routingStatus || 'Direct',
    routingMessage: deptResult.routingMessage,
  };
}

export interface NoIssueCheckResult {
  isNoIssue: boolean;
  reason?: string;
  identifiedIssue?: string;
}

function hasPositiveCivicIssue(text: string): { hasIssue: boolean; issueName?: string } {
  const norm = text.toLowerCase().trim();

  const issueDefs = [
    { name: 'Street Light Fault', pattern: /\b(street\s*lights?|lamps?|lamp\s*posts?|light\s*poles?|lights?\s*not\s*working)\b/i },
    { name: 'Pothole', pattern: /\b(potholes?|pot\s*holes?|craters?|road\s*pits?)\b/i },
    { name: 'Road Crack', pattern: /\b(cracks?|cracking|alligator\s*cracking|fissures?)\b/i },
    { name: 'Waterlogging', pattern: /\b(waterlogging|water\s*logging|standing\s*water|water\s*accumulat\w+|flooded)\b/i },
    { name: 'Drainage Blockage', pattern: /\b(blocked\s*drains?|storm\s*drains?|drains?\s*(?:is|are)?\s*blocked|clogged\s*drains?|drainage\s*blockage|drainage|drains?)\b/i },
    { name: 'Damaged Manhole', pattern: /\b(manholes?|man\s*hole|broken\s*manhole|open\s*manhole)\b/i },
    { name: 'Damaged Footpath', pattern: /\b(footpaths?|sidewalks?|pedestrian\s*walkway)\b/i },
    { name: 'Road Divider Damage', pattern: /\b(road\s*dividers?|medians?|broken\s*divider)\b/i },
    { name: 'Damaged Traffic Sign', pattern: /\b(traffic\s*signs?|signboards?|missing\s*sign)\b/i },
    { name: 'Garbage Overflow', pattern: /\b(garbage|trash|dustbins?|waste\s*dump)\b/i },
  ];

  for (const def of issueDefs) {
    if (def.pattern.test(norm)) {
      // Check if it's negated in this context (e.g. "no pothole")
      const match = norm.match(new RegExp(`\\b(?:no|not|without)\\s+(?:a\\s+|an\\s+|any\\s+)?(?:visible\\s+|noticeable\\s+)?${def.pattern.source.replace(/^\\b|\\b$/g, '')}`, 'i'));
      if (!match) {
        return { hasIssue: true, issueName: def.name };
      }
    }
  }

  return { hasIssue: false };
}

/**
 * Evaluates whether a citizen description explicitly indicates NO ISSUE or negation.
 * Handles compound sentences correctly (e.g. "There is no pothole, but there is a broken streetlight").
 */
export function checkDescriptionHasNoIssue(text: string): NoIssueCheckResult {
  if (!text || typeof text !== 'string') {
    return { isNoIssue: true, reason: 'Empty description' };
  }

  const clean = text.toLowerCase().trim();

  // 1. Direct universal "no issue" statements
  const universalNoIssuePatterns = [
    /\b(the\s+)?(road|street|path|walkway|pavement|lane|route)\s+is\s+(fine|good|okay|ok|clear|clean|in\s+good\s+condition|well\s+maintained|normal)\b/i,
    /\b(the\s+)?condition\s+is\s+(fine|good|okay|ok|normal)\b/i,
    /\bno\s+(damage|problem|issue|defect|hazard|complaint)(\s+or\s+(damage|problem|issue|defect|hazard))?(\s+found|\s+here|\s+present|\s+at\s+all|\s+on\s+this\s+road|\s+noticed)?\b/i,
    /\bthere\s+is\s+no\s+(damage|problem|issue|defect|hazard)(\s+here|\s+found|\s+on\s+this\s+road)?\b/i,
    /\beverything\s+(is|looks)\s+(fine|good|okay|ok|normal|clean)\b/i,
    /\bnothing\s+(is\s+)?wrong\b/i,
    /^(\s*no\s+(damage|problem|issue|defect|hazard|pothole|cracks?)\s*)+$/i,
  ];

  for (const pat of universalNoIssuePatterns) {
    if (pat.test(clean)) {
      // Check if there is a contrastive conjunction with an actual issue
      // e.g. "The road is fine, but there is a broken streetlight"
      const contrastMatch = clean.match(/\b(but|however|except|yet|although)\b\s*(.+)/i);
      if (contrastMatch) {
        const afterContrast = contrastMatch[2];
        const hasIssueAfter = hasPositiveCivicIssue(afterContrast);
        if (hasIssueAfter.hasIssue) {
          return { isNoIssue: false, identifiedIssue: hasIssueAfter.issueName };
        }
      }
      return { isNoIssue: true, reason: 'Description explicitly states there is no issue or the road is fine.' };
    }
  }

  // 2. Check for clauses
  // Split on contrastive conjunctions: but, however, except, although
  const clauses = clean.split(/\b(?:but|however|except|although|whereas)\b/i);

  if (clauses.length > 1) {
    // Check if any clause reports a positive civic issue
    for (const clause of clauses) {
      const res = hasPositiveCivicIssue(clause);
      if (res.hasIssue) {
        return { isNoIssue: false, identifiedIssue: res.issueName };
      }
    }
    // If all clauses either report no issue or negations
    return { isNoIssue: true, reason: 'All clauses in description indicate no civic issue.' };
  }

  // Single clause check:
  // Is the defect negated? e.g. "There is no pothole on this road"
  const negatedDefectRegex = /\b(there\s+is\s+no|there\s+are\s+no|no|not\s+any|without\s+any)\s+(pothole|potholes|pot\s*hole|cracks?|road\s*cracks?|damage|defect|waterlogging|street\s*light\s*fault|broken\s*divider)\b/i;
  if (negatedDefectRegex.test(clean)) {
    const stripped = clean.replace(negatedDefectRegex, ' ');
    const remainingIssue = hasPositiveCivicIssue(stripped);
    if (!remainingIssue.hasIssue) {
      return { isNoIssue: true, reason: 'The defect in description is negated ("no pothole / no damage").' };
    }
    return { isNoIssue: false, identifiedIssue: remainingIssue.issueName };
  }

  return { isNoIssue: false };
}

