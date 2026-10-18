/**
 * CivicEye - Centralized Resolution Duration Calculation Service
 * 
 * Calculates estimated resolution duration and expected completion dates
 * based on Complaint Priority AND Issue / Complaint Type.
 */

export interface EstimatedDurationResult {
  durationDays: number;
  durationText: string;
  expectedResolutionDate: Date;
  formattedExpectedDate: string; // DD/MM/YYYY format
}

/**
 * Format date as DD/MM/YYYY
 */
export function formatResolutionDate(date?: Date | string | null): string {
  if (!date) {
    return 'Pending Verification';
  }
  let d: Date;
  if (date instanceof Date) {
    d = date;
  } else {
    d = new Date(date);
  }
  if (isNaN(d.getTime())) {
    return 'Pending Verification';
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Calculate expected resolution date by adding duration days to submission timestamp.
 * Does not modify original submission timestamp.
 */
export function calculateExpectedResolutionDate(baseDate: Date = new Date(), durationDays: number): Date {
  const result = new Date(baseDate.getTime());
  result.setDate(result.getDate() + Math.max(1, durationDays));
  return result;
}

/**
 * Duration matrix based on:
 * 1. Priority (CRITICAL, HIGH, MEDIUM, LOW)
 * 2. Issue Type & Department context
 */
const ISSUE_CATEGORY_MATRIX: Record<string, { high: number; medium: number; low: number; critical: number }> = {
  // Road & Infrastructure Hazards
  pothole: { critical: 1, high: 2, medium: 3, low: 5 },
  'alligator cracking': { critical: 1, high: 2, medium: 4, low: 7 },
  cracking: { critical: 2, high: 3, medium: 5, low: 7 },
  'damaged road': { critical: 1, high: 2, medium: 4, low: 7 },
  'road issue': { critical: 1, high: 2, medium: 3, low: 5 },

  // Safety & Divider Defects
  'road divider damage': { critical: 1, high: 1, medium: 3, low: 5 },
  'missing signage': { critical: 1, high: 2, medium: 4, low: 7 },
  'road divider issue': { critical: 1, high: 1, medium: 3, low: 5 },
  'signage / signal fault': { critical: 1, high: 2, medium: 4, low: 7 },

  // Street Lighting
  'street light fault': { critical: 1, high: 2, medium: 3, low: 5 },
  'street light broken': { critical: 1, high: 2, medium: 3, low: 5 },
  'street light defect': { critical: 1, high: 2, medium: 3, low: 5 },

  // Drainage & Stormwater
  waterlogging: { critical: 1, high: 1, medium: 3, low: 5 },
  'drainage blockage': { critical: 1, high: 2, medium: 3, low: 6 },
  'drainage problem': { critical: 1, high: 2, medium: 3, low: 6 },
  'stormwater issue': { critical: 1, high: 2, medium: 3, low: 6 },
  'drain cover damage': { critical: 1, high: 1, medium: 2, low: 4 },

  // Sewerage
  'sewage overflow': { critical: 1, high: 1, medium: 2, low: 4 },
  'sewer blockage': { critical: 1, high: 2, medium: 3, low: 5 },
  'sewage leakage': { critical: 1, high: 2, medium: 3, low: 5 },
  'sewerage issue': { critical: 1, high: 2, medium: 3, low: 5 },
  'manhole defect': { critical: 1, high: 1, medium: 2, low: 4 },

  // Solid Waste Management
  'garbage overflow': { critical: 1, high: 1, medium: 2, low: 4 },
  'solid waste issue': { critical: 1, high: 2, medium: 3, low: 5 },
  'garbage bin problem': { critical: 1, high: 2, medium: 3, low: 5 },
  'uncollected waste': { critical: 1, high: 1, medium: 2, low: 4 },

  // Public Building Maintenance
  'building damage': { critical: 1, high: 2, medium: 4, low: 7 },
  'roof leakage': { critical: 1, high: 2, medium: 4, low: 7 },
  'wall damage': { critical: 2, high: 3, medium: 5, low: 10 },
  'ceiling damage': { critical: 1, high: 2, medium: 4, low: 7 },
  'building repair': { critical: 2, high: 3, medium: 5, low: 10 },

  // Trees & Greenery
  'fallen tree': { critical: 1, high: 1, medium: 2, low: 3 },
  'dangerous tree': { critical: 1, high: 1, medium: 2, low: 3 },
  'tree maintenance': { critical: 2, high: 3, medium: 5, low: 7 },
  'overgrown vegetation': { critical: 2, high: 3, medium: 5, low: 7 },
  'tree / greenery issue': { critical: 2, high: 3, medium: 5, low: 7 },

  // Parks & Public Spaces
  'playground damage': { critical: 1, high: 2, medium: 4, low: 7 },
  'park damage': { critical: 2, high: 3, medium: 5, low: 8 },
  'park maintenance': { critical: 2, high: 3, medium: 5, low: 8 },
  'park issue': { critical: 2, high: 3, medium: 5, low: 8 },

  // Public Works Department
  'public route issue': { critical: 1, high: 2, medium: 4, low: 7 },
  'damaged footpath': { critical: 1, high: 2, medium: 4, low: 7 },
  'public works defect': { critical: 1, high: 2, medium: 4, low: 7 },
};

/**
 * Returns the estimated resolution duration based on Priority AND Issue Type.
 * 
 * @param priority Complaint priority ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')
 * @param issueType Issue name (e.g. 'Pothole', 'Garbage Overflow', 'Drainage Blockage')
 * @param department Optional department name
 * @param submittedAt Date when the complaint was submitted (defaults to now)
 */
export function getEstimatedResolutionDuration(
  priority?: string,
  issueType?: string,
  department?: string,
  submittedAt?: Date | string | number
): EstimatedDurationResult {
  const normPriority = (priority || 'MEDIUM').toUpperCase().trim();
  const normIssue = (issueType || '').toLowerCase().trim();
  const normDept = (department || '').toLowerCase().trim();

  let parsedDate: Date = new Date();
  if (submittedAt) {
    if (submittedAt instanceof Date && !isNaN(submittedAt.getTime())) {
      parsedDate = submittedAt;
    } else if (typeof submittedAt === 'string' || typeof submittedAt === 'number') {
      const d = new Date(submittedAt);
      if (!isNaN(d.getTime())) {
        parsedDate = d;
      }
    }
  }

  // Check direct issue match
  let days: number | undefined;
  for (const [key, mapping] of Object.entries(ISSUE_CATEGORY_MATRIX)) {
    if (normIssue === key || normIssue.includes(key) || key.includes(normIssue)) {
      if (normPriority === 'CRITICAL') days = mapping.critical;
      else if (normPriority === 'HIGH') days = mapping.high;
      else if (normPriority === 'LOW') days = mapping.low;
      else days = mapping.medium;
      break;
    }
  }

  // Department-level fallback if issue type didn't match directly
  if (days === undefined) {
    if (normDept.includes('waste') || normDept.includes('garbage')) {
      days = normPriority === 'HIGH' || normPriority === 'CRITICAL' ? 1 : normPriority === 'LOW' ? 4 : 2;
    } else if (normDept.includes('drain') || normDept.includes('waterlog')) {
      days = normPriority === 'HIGH' || normPriority === 'CRITICAL' ? 1 : normPriority === 'LOW' ? 5 : 3;
    } else if (normDept.includes('sewer')) {
      days = normPriority === 'HIGH' || normPriority === 'CRITICAL' ? 1 : normPriority === 'LOW' ? 5 : 2;
    } else if (normDept.includes('tree')) {
      days = normPriority === 'HIGH' || normPriority === 'CRITICAL' ? 1 : normPriority === 'LOW' ? 7 : 4;
    } else if (normDept.includes('light')) {
      days = normPriority === 'HIGH' || normPriority === 'CRITICAL' ? 2 : normPriority === 'LOW' ? 5 : 3;
    } else if (normDept.includes('building')) {
      days = normPriority === 'HIGH' || normPriority === 'CRITICAL' ? 2 : normPriority === 'LOW' ? 8 : 4;
    } else if (normDept.includes('park')) {
      days = normPriority === 'HIGH' || normPriority === 'CRITICAL' ? 2 : normPriority === 'LOW' ? 8 : 4;
    } else {
      // General Road / Infrastructure default
      if (normPriority === 'CRITICAL') days = 1;
      else if (normPriority === 'HIGH') days = 2;
      else if (normPriority === 'LOW') days = 7;
      else days = 3;
    }
  }

  // Ensure positive number of days
  const finalDays = Math.max(1, days || 3);
  const durationText = finalDays === 1 ? '1 Day' : `${finalDays} Days`;
  const expectedResolutionDate = calculateExpectedResolutionDate(parsedDate, finalDays);
  const formattedExpectedDate = formatResolutionDate(expectedResolutionDate);

  return {
    durationDays: finalDays,
    durationText,
    expectedResolutionDate,
    formattedExpectedDate,
  };
}
