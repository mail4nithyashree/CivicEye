export function checkDescriptionHasNoIssue(text) {
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
    // If the defect is negated and there's no other positive civic issue
    const stripped = clean.replace(negatedDefectRegex, ' ');
    const remainingIssue = hasPositiveCivicIssue(stripped);
    if (!remainingIssue.hasIssue) {
      return { isNoIssue: true, reason: 'The defect in description is negated ("no pothole / no damage").' };
    }
    return { isNoIssue: false, identifiedIssue: remainingIssue.issueName };
  }

  return { isNoIssue: false };
}

function hasPositiveCivicIssue(text) {
  const norm = text.toLowerCase().trim();
  // Ensure it's not negated
  const negatedPrefix = /\b(no|not|never|without)\s+(a\s+|an\s+|any\s+)?/i;

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
      // Check if it's negated in this context
      const match = norm.match(new RegExp(`\\b(?:no|not|without)\\s+(?:a\\s+|an\\s+|any\\s+)?(?:visible\\s+|noticeable\\s+)?${def.pattern.source.replace(/^\\b|\\b$/g, '')}`, 'i'));
      if (!match) {
        return { hasIssue: true, issueName: def.name };
      }
    }
  }

  return { hasIssue: false };
}

// Test cases from specification
const testCases = [
  { text: 'There is no pothole on this road.', expectedNoIssue: true },
  { text: 'The road is fine.', expectedNoIssue: true },
  { text: 'No damage or problem found.', expectedNoIssue: true },
  { text: 'There is no issue here.', expectedNoIssue: true },
  { text: 'There is no pothole, but there is a broken streetlight', expectedNoIssue: false },
  { text: 'A pothole is present near the junction', expectedNoIssue: false },
  { text: 'There are long cracks on the road', expectedNoIssue: false },
  { text: 'Rainwater is accumulating on the road', expectedNoIssue: false },
  { text: 'The streetlight is not working', expectedNoIssue: false },
  { text: 'The road is fine, but the storm drain is blocked', expectedNoIssue: false },
];

console.log('--- Testing Description Negation & No-Issue Detection ---');
let allPassed = true;
for (const tc of testCases) {
  const res = checkDescriptionHasNoIssue(tc.text);
  const pass = res.isNoIssue === tc.expectedNoIssue;
  console.log(`${pass ? '✅' : '❌'} "${tc.text}" -> isNoIssue: ${res.isNoIssue} (expected ${tc.expectedNoIssue}) ${res.identifiedIssue ? `[Identified: ${res.identifiedIssue}]` : ''}`);
  if (!pass) allPassed = false;
}
if (!allPassed) process.exit(1);
console.log('All negation tests passed!');
