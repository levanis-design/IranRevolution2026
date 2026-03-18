/* eslint-disable no-console */
import { fetchMemorials, verifyMemorial } from '../src/modules/dataService';
import type { MemorialEntry } from '../src/modules/types';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Admin AI Agent - Reviews unverified memorial submissions and auto-approves valid ones
 *
 * This agent:
 * 1. Fetches all unverified memorials
 * 2. Calculates source credibility score
 * 3. High-credibility sources (RTN, BBC, etc.) get instant approval
 * 4. Medium-credibility sources get AI review
 * 5. Low/unknown sources get stricter review or manual review
 * 6. Saves detailed audit log
 */

// ============================================================================
// Source Credibility Configuration
// ============================================================================

type CredibilityLevel = 'instant' | 'high' | 'medium' | 'low' | 'unknown';

interface CredibilityRule {
  patterns: string[];
  level: CredibilityLevel;
  description: string;
}

/**
 * Source credibility rules - ordered by priority (first match wins)
 *
 * instant: Auto-approve without AI review
 * high: AI review with high approval threshold
 * medium: AI review with standard approval threshold
 * low: AI review with strict approval threshold
 * unknown: Always flag for manual review
 */
const CREDIBILITY_RULES: CredibilityRule[] = [
  {
    patterns: ['RememberTheirNames', 't.me/remember', 'telegram.me/remember'],
    level: 'instant',
    description: 'Remember Their Names (verified human rights org)'
  },
  {
    patterns: ['bbc.com', 'bbc.co.uk', 'bbc.persian', 'bbcfa'],
    level: 'high',
    description: 'BBC News'
  },
  {
    patterns: ['hrana.org', 'hrana.net', 'humanrightsactivists'],
    level: 'high',
    description: 'HRANA (Human Rights Activists News Agency)'
  },
  {
    patterns: ['iranhr.net', 'iranhumanrights'],
    level: 'high',
    description: 'Iran Human Rights (IHR)'
  },
  {
    patterns: ['hengaw.net', 'hengaw.org'],
    level: 'high',
    description: 'Hengaw (Human Rights Organization)'
  },
  {
    patterns: ['amnesty.org', 'amnesty'],
    level: 'high',
    description: 'Amnesty International'
  },
  {
    patterns: ['hrw.org', 'humanrightswatch'],
    level: 'high',
    description: 'Human Rights Watch'
  },
  {
    patterns: ['reuters.com', 'apnews.com', 'ap.org', 'associatedpress'],
    level: 'medium',
    description: 'Major international news agencies'
  },
  {
    patterns: ['nytimes.com', 'washingtonpost.com', 'theguardian.com', 'aljazeera.com'],
    level: 'medium',
    description: 'Major international newspapers'
  },
  {
    patterns: ['iranintl.com', 'iraninternational', 'iranintl'],
    level: 'medium',
    description: 'Iran International'
  },
  {
    patterns: ['x.com', 'twitter.com', 'instagram.com', 'facebook.com', 't.me/', 'telegram.me/'],
    level: 'medium',
    description: 'Social media'
  },
  {
    patterns: ['wikipedia.org', 'wiki'],
    level: 'medium',
    description: 'Wikipedia'
  }
];

// ============================================================================
// Type Definitions
// ============================================================================

interface ReviewResult {
  id: string;
  name: string;
  credibilityLevel: CredibilityLevel;
  credibilitySource?: string;
  approved: boolean;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  merged?: boolean;
}

interface ReviewStats {
  total: number;
  instantApproved: number;
  aiApproved: number;
  merged: number;
  manualReview: number;
  errors: number;
  byCredibility: Record<CredibilityLevel, number>;
}

interface AuditLogEntry {
  timestamp: string;
  id: string;
  name: string;
  credibilityLevel: CredibilityLevel;
  credibilitySource?: string;
  approved: boolean;
  reason: string;
  confidence: string;
  merged?: boolean;
}

// ============================================================================
// Source Credibility Scoring
// ============================================================================

/**
 * Calculate credibility level from memorial sources
 */
function calculateCredibility(memorial: MemorialEntry): {
  level: CredibilityLevel;
  source: string;
  description: string;
} {
  // Check all URLs (media + references)
  const allUrls = [
    memorial.media?.xPost,
    memorial.media?.telegramPost,
    ...(memorial.references?.map((r) => r.url) || [])
  ].filter(Boolean);

  for (const rule of CREDIBILITY_RULES) {
    for (const url of allUrls) {
      if (rule.patterns.some(pattern => url.toLowerCase().includes(pattern.toLowerCase()))) {
        return {
          level: rule.level,
          source: url,
          description: rule.description
        };
      }
    }
  }

  // No recognized source
  return {
    level: 'unknown',
    source: allUrls[0] || 'none',
    description: 'Unrecognized source'
  };
}

/**
 * Get emoji for credibility level
 */
function getCredibilityEmoji(level: CredibilityLevel): string {
  const emojis = {
    instant: '⚡',
    high: '🟢',
    medium: '🟡',
    low: '🟠',
    unknown: '⚪'
  };
  return emojis[level];
}

// ============================================================================
// AI Validation
// ============================================================================

/**
 * Build AI validation prompt based on credibility level
 */
function buildValidationPrompt(memorial: MemorialEntry, credibility: CredibilityLevel): string {
  const strictness = credibility === 'low' ? 'strict' : credibility === 'high' ? 'lenient' : 'standard';

  return `You are reviewing a memorial submission for the Iran Revolution 2026 database.
CREDIBILITY LEVEL OF SOURCES: ${credibility.toUpperCase()}
VALIDATION STRICTNESS: ${strictness.toUpperCase()}

Evaluate this submission for validity and completeness:

NAME: ${memorial.name}
${memorial.name_fa ? `PERSIAN NAME: ${memorial.name_fa}` : ''}
CITY: ${memorial.city}
${memorial.city_fa ? `PERSIAN CITY: ${memorial.city_fa}` : ''}
DATE: ${memorial.date}
${memorial.location ? `LOCATION: ${memorial.location}` : ''}
${memorial.bio ? `BIO: ${memorial.bio}` : ''}

REFERENCES:
${memorial.references?.map((r) => `- ${r.label}: ${r.url}`).join('\n') || 'None'}

Evaluate the submission based on these criteria:

1. COMPLETENESS: Has a valid name, date, and at least one reference
2. CONSISTENCY: Name looks like a real person (not "Test", "Unknown", placeholder text)
3. CREDIBILITY: Has credible source references
4. REASONABLENESS: Date is within plausible range (2022-2026 for Iran revolution events)
5. AUTHENTICITY: Bio/details sound authentic, not obviously fake or automated

${credibility === 'low' ? `
⚠️ STRICT MODE: This submission has LOW credibility sources. Be EXTRA cautious and reject if there are any doubts.
Look for signs of: fake names, automated submissions, testing data, or unreliable sources.
` : ''}

${credibility === 'high' ? `
✅ LENIENT MODE: This submission has HIGH credibility sources. Be reasonable and approve if the submission looks complete.
` : ''}

Respond in JSON format:
{
  "approved": true/false,
  "confidence": "high"|"medium"|"low",
  "reason": "brief explanation of decision",
  "issues": ["list of any issues found"]
}

Be cautious but fair - approve if reasonably confident, flag for manual review if unsure.`;
}

/**
 * Calls AI to validate a memorial submission
 */
async function validateWithAI(
  memorial: MemorialEntry,
  credibility: CredibilityLevel
): Promise<{
  approved: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  issues: string[];
}> {
  try {
    // Import AI module dynamically to avoid circular dependencies
    const { generateText } = await import('../src/modules/ai');

    const prompt = buildValidationPrompt(memorial, credibility);
    const result = await generateText(prompt);

    // Try to parse JSON response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Fall through to default response
      }
    }

    // If parsing failed, do a basic rule-based validation
    return basicValidation(memorial, credibility);
  } catch (error) {
    console.error(`  ⚠️  AI validation error, using rule-based fallback`);
    return basicValidation(memorial, credibility);
  }
}

/**
 * Fallback rule-based validation when AI is unavailable
 */
function basicValidation(memorial: MemorialEntry, credibility: CredibilityLevel): {
  approved: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  issues: string[];
} {
  const issues: string[] = [];

  // Check for placeholder names
  const invalidNames = ['test', 'unknown', 'n/a', 'tbd', 'placeholder', 'ناشناس', 'نامشخص'];
  if (invalidNames.some(n => memorial.name.toLowerCase().includes(n))) {
    issues.push('Invalid or placeholder name');
  }

  // Check for references
  if (!memorial.references || memorial.references.length === 0) {
    issues.push('No source references provided');
  }

  // Check date reasonableness
  const date = new Date(memorial.date);
  const minDate = new Date('2022-01-01');
  const maxDate = new Date('2027-01-01');
  if (date < minDate || date > maxDate) {
    issues.push('Date outside expected range');
  }

  // Low credibility submissions require more scrutiny
  if (credibility === 'unknown' || credibility === 'low') {
    if (!memorial.bio || memorial.bio.length < 20) {
      issues.push('No meaningful biography provided');
    }
    if (!memorial.name_fa && !memorial.city_fa) {
      issues.push('No Persian translation provided');
    }
  }

  // Determine approval based on issues and credibility
  if (issues.length === 0) {
    if (credibility === 'instant' || credibility === 'high') {
      return {
        approved: true,
        confidence: 'high',
        reason: `Complete submission with ${credibility} credibility source`,
        issues: []
      };
    }
    return {
      approved: true,
      confidence: 'medium',
      reason: 'Complete submission with references',
      issues: []
    };
  }

  return {
    approved: false,
    confidence: issues.length <= 1 ? 'medium' : 'low',
    reason: `Issues: ${issues.join(', ')}`,
    issues
  };
}

// ============================================================================
// Review Logic
// ============================================================================

/**
 * Reviews a single memorial submission
 */
async function reviewMemorial(
  memorial: MemorialEntry,
  auditLog: AuditLogEntry[]
): Promise<ReviewResult> {
  if (!memorial.id) {
    console.log(`  ❌ Error: Memorial missing ID: ${memorial.name}`);
    return {
      id: 'unknown',
      name: memorial.name,
      credibilityLevel: 'unknown',
      approved: false,
      reason: 'Error: Missing memorial ID',
      confidence: 'low'
    };
  }

  console.log(`\n📋 Reviewing: ${memorial.name} (${memorial.id})`);

  // Step 1: Calculate source credibility
  const credibility = calculateCredibility(memorial);
  const emoji = getCredibilityEmoji(credibility.level);
  console.log(`  ${emoji} Credibility: ${credibility.level.toUpperCase()} - ${credibility.description}`);

  // Step 2: Instant approval for high-credibility sources
  if (credibility.level === 'instant') {
    console.log(`  ⚡ INSTANT APPROVAL - Trusted source`);
    const result = await verifyMemorial(memorial.id);

    const logEntry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      id: memorial.id,
      name: memorial.name,
      credibilityLevel: credibility.level,
      credibilitySource: credibility.source,
      approved: result.success,
      reason: 'Instant approval - trusted RTN source',
      confidence: 'high',
      merged: result.merged
    };
    auditLog.push(logEntry);

    if (result.success) {
      if (result.merged) {
        console.log(`  🔄 Merged with existing entry`);
      }
      console.log(`  ✅ APPROVED`);
      return {
        id: memorial.id,
        name: memorial.name,
        credibilityLevel: credibility.level,
        credibilitySource: credibility.source,
        approved: true,
        reason: 'Instant approval - trusted RTN source',
        confidence: 'high',
        merged: result.merged
      };
    } else {
      console.log(`  ❌ Approval failed: ${result.error}`);
      return {
        id: memorial.id,
        name: memorial.name,
        credibilityLevel: credibility.level,
        credibilitySource: credibility.source,
        approved: false,
        reason: `Error: ${result.error}`,
        confidence: 'low'
      };
    }
  }

  // Step 3: AI review for other levels
  console.log(`  🤖 AI Review (${credibility.level} credibility mode)...`);
  const validation = await validateWithAI(memorial, credibility.level);

  const logEntry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    id: memorial.id,
    name: memorial.name,
    credibilityLevel: credibility.level,
    credibilitySource: credibility.source,
    approved: validation.approved,
    reason: validation.reason,
    confidence: validation.confidence
  };
  auditLog.push(logEntry);

  // Step 4: Approve or flag based on validation
  if (validation.approved && validation.confidence !== 'low') {
    // Auto-approve high and medium confidence submissions
    const result = await verifyMemorial(memorial.id);

    if (result.success) {
      console.log(`  ✅ APPROVED (${validation.confidence} confidence): ${validation.reason}`);
      if (result.merged) {
        console.log(`  🔄 Merged with existing entry`);
      }
      return {
        id: memorial.id,
        name: memorial.name,
        credibilityLevel: credibility.level,
        credibilitySource: credibility.source,
        approved: true,
        reason: validation.reason,
        confidence: validation.confidence,
        merged: result.merged
      };
    } else {
      console.log(`  ❌ Approval failed: ${result.error}`);
      return {
        id: memorial.id,
        name: memorial.name,
        credibilityLevel: credibility.level,
        credibilitySource: credibility.source,
        approved: false,
        reason: `Error: ${result.error}`,
        confidence: 'low'
      };
    }
  } else {
    // Flag for manual review
    console.log(`  ⚠️  FLAGGED for manual review (${validation.confidence} confidence): ${validation.reason}`);
    if (validation.issues.length > 0) {
      console.log(`     Issues: ${validation.issues.join(', ')}`);
    }
    return {
      id: memorial.id,
      name: memorial.name,
      credibilityLevel: credibility.level,
      credibilitySource: credibility.source,
      approved: false,
      reason: validation.reason,
      confidence: validation.confidence
    };
  }
}

// ============================================================================
// Main Process
// ============================================================================

/**
 * Save audit log to file
 */
function saveAuditLog(auditLog: AuditLogEntry[]): void {
  try {
    const logsDir = join(process.cwd(), 'logs');
    mkdirSync(logsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = join(logsDir, `admin-review-${timestamp}.json`);

    writeFileSync(logFile, JSON.stringify(auditLog, null, 2));
    console.log(`\n📁 Audit log saved to: ${logFile}`);
  } catch (error) {
    console.error(`  ⚠️  Failed to save audit log:`, error);
  }
}

/**
 * Main admin review process
 */
async function runAdminReview(): Promise<void> {
  console.log('🤖 Admin AI Agent Starting...');
  console.log('═══════════════════════════════════════\n');

  // Fetch all memorials (including unverified)
  const allMemorials = await fetchMemorials(true);
  const unverified = allMemorials.filter(m => !m.verified);

  console.log(`📊 Found ${allMemorials.length} total memorials`);
  console.log(`📝 ${unverified.length} unverified submissions to review\n`);

  if (unverified.length === 0) {
    console.log('✨ No submissions to review. All caught up!');
    return;
  }

  // Initialize stats
  const stats: ReviewStats = {
    total: unverified.length,
    instantApproved: 0,
    aiApproved: 0,
    merged: 0,
    manualReview: 0,
    errors: 0,
    byCredibility: {
      instant: 0,
      high: 0,
      medium: 0,
      low: 0,
      unknown: 0
    }
  };

  const auditLog: AuditLogEntry[] = [];

  // Review each submission
  for (const memorial of unverified) {
    const result = await reviewMemorial(memorial, auditLog);

    // Update stats
    stats.byCredibility[result.credibilityLevel]++;

    if (result.approved) {
      if (result.credibilityLevel === 'instant') {
        stats.instantApproved++;
      } else {
        stats.aiApproved++;
      }
      if (result.merged) {
        stats.merged++;
      }
    } else if (result.reason.includes('Error')) {
      stats.errors++;
    } else {
      stats.manualReview++;
    }

    // Rate limiting: longer delay for AI calls, shorter for instant approval
    const delay = result.credibilityLevel === 'instant' ? 300 : 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // Save audit log
  saveAuditLog(auditLog);

  // Print summary
  console.log('\n═══════════════════════════════════════');
  console.log('📊 REVIEW SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log(`Total reviewed:       ${stats.total}`);
  console.log(`⚡ Instant approved:   ${stats.instantApproved}`);
  console.log(`🤖 AI approved:        ${stats.aiApproved}`);
  console.log(`🔄 Merged:             ${stats.merged}`);
  console.log(`⚠️  Manual review:      ${stats.manualReview}`);
  console.log(`❌ Errors:             ${stats.errors}`);
  console.log('\n📈 By Credibility Level:');
  console.log(`  ⚡ Instant (RTN):     ${stats.byCredibility.instant}`);
  console.log(`  🟢 High:              ${stats.byCredibility.high}`);
  console.log(`  🟡 Medium:            ${stats.byCredibility.medium}`);
  console.log(`  🟠 Low:               ${stats.byCredibility.low}`);
  console.log(`  ⚪ Unknown:           ${stats.byCredibility.unknown}`);
  console.log('═══════════════════════════════════════');

  if (stats.manualReview > 0) {
    console.log('\n📌 Submissions flagged for manual review need human attention.');
    console.log('   Check the admin panel to review them.');
  }
}

// Run if called directly
runAdminReview().catch(console.error);
