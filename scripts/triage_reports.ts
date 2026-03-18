/* eslint-disable no-console */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { supabaseAdmin, supabase } from '../src/modules/supabase';
import { generateText } from '../src/modules/ai';
import { getMemorialById } from '../src/modules/dataService';

/**
 * AI-Assisted Report Triage Script
 *
 * Processes all pending user reports one-by-one using Gemini AI.
 * For each report, fetches the linked memorial and asks Gemini to decide:
 *   - resolve: Report raises a valid concern worth noting
 *   - dismiss: Report is invalid, spam, or the memorial data is correct
 *
 * Usage:
 *   npm run triage-reports              # Apply decisions
 *   npm run triage-reports -- --dry-run # Preview only, no DB changes
 */

const DRY_RUN = process.argv.includes('--dry-run');
const client = supabaseAdmin || supabase;

// ============================================================================
// Types
// ============================================================================

interface TriageResult {
  reportId: string;
  memorialId: string;
  memorialName: string;
  reason: string;
  details: string | null;
  decision: 'resolve' | 'dismiss' | 'error';
  aiReason: string;
  timestamp: string;
}

// ============================================================================
// AI Triage
// ============================================================================

function buildTriagePrompt(report: any, memorial: any): string {
  const sources = Array.isArray(memorial?.source_links)
    ? (memorial.source_links as any[]).map((r: any) => `- ${r.label || ''}: ${r.url || ''}`).join('\n')
    : 'None';

  return `You are reviewing a user-submitted report about a memorial entry in the Iran Revolution Memorial database.

This database commemorates individuals who lost their lives during the Iranian revolution. Reports are submitted by visitors who believe there is an issue with a memorial entry.

REPORT:
- Reason category: ${report.reason}
- User details: "${report.details || '(none provided)'}"

MEMORIAL ENTRY BEING REPORTED:
- Name: ${memorial?.name || 'Unknown'}
${memorial?.name_fa ? `- Persian name: ${memorial.name_fa}` : ''}
- City: ${memorial?.city || 'Unknown'}
- Date: ${memorial?.date || 'Unknown'}
${memorial?.bio ? `- Bio: ${memorial.bio}` : ''}
- Sources:\n${sources}
- Verified: ${memorial?.verified ? 'Yes' : 'No'}

DECISION GUIDE:
- "resolve": The report raises a valid concern (e.g., genuinely wrong person identified, confirmed duplicate, clearly incorrect data, real sensitive content issue)
- "dismiss": The report appears invalid (e.g., vague complaint, no evidence provided, data appears correct, spam or test submission, disagrees without basis)

Respond with ONLY valid JSON (no markdown, no explanation):
{"decision": "resolve" or "dismiss", "reason": "one sentence explaining your decision"}`;
}

async function triageWithAI(report: any, memorial: any): Promise<{ decision: 'resolve' | 'dismiss'; reason: string }> {
  try {
    const prompt = buildTriagePrompt(report, memorial);
    const result = await generateText(prompt);

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.decision === 'resolve' || parsed.decision === 'dismiss') {
        return { decision: parsed.decision, reason: parsed.reason || 'No reason provided' };
      }
    }

    // Fallback: dismiss if we can't parse a clear decision
    return { decision: 'dismiss', reason: 'AI response could not be parsed — defaulting to dismiss' };
  } catch (e) {
    throw new Error(`AI call failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ============================================================================
// Database Operations
// ============================================================================

async function resolveReport(id: string): Promise<{ success: boolean; error?: string }> {
  if (!client) return { success: false, error: 'No DB client' };
  const { error } = await (client as any).from('reports').update({ status: 'resolved' }).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

async function dismissReport(id: string): Promise<{ success: boolean; error?: string }> {
  if (!client) return { success: false, error: 'No DB client' };
  const { error } = await (client as any).from('reports').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

async function fetchPendingReports(): Promise<any[]> {
  if (!client) return [];
  const { data, error } = await (client as any)
    .from('reports')
    .select('*')
    .or('status.eq.pending,status.is.null')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('Error fetching reports:', error.message);
    return [];
  }
  return data || [];
}

// ============================================================================
// Audit Log
// ============================================================================

function saveAuditLog(results: TriageResult[]): void {
  try {
    const logsDir = join(process.cwd(), 'logs');
    mkdirSync(logsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = join(logsDir, `reports-triage-audit-${timestamp}.json`);
    writeFileSync(logFile, JSON.stringify(results, null, 2));
    console.log(`\n📁 Audit log saved: ${logFile}`);
  } catch (e) {
    console.error('  ⚠️  Failed to save audit log:', e);
  }
}

// ============================================================================
// Main
// ============================================================================

async function triageReports(): Promise<void> {
  console.log('🤖 Report Triage Agent Starting...');
  if (DRY_RUN) console.log('  ⚠️  DRY RUN — no changes will be applied');
  console.log('═══════════════════════════════════════\n');

  if (!client) {
    console.error('❌ Supabase not configured. Check your .env file.');
    process.exit(1);
  }

  const reports = await fetchPendingReports();
  console.log(`📊 Found ${reports.length} pending reports to triage\n`);

  if (reports.length === 0) {
    console.log('✨ No pending reports. All caught up!');
    return;
  }

  const results: TriageResult[] = [];
  let resolved = 0;
  let dismissed = 0;
  let errors = 0;

  for (let i = 0; i < reports.length; i++) {
    const report = reports[i];
    console.log(`\n[${i + 1}/${reports.length}] Report: ${report.memorial_name} (${report.reason})`);
    if (report.details) console.log(`  Details: "${report.details.substring(0, 100)}"`);

    const result: TriageResult = {
      reportId: report.id,
      memorialId: report.memorial_id,
      memorialName: report.memorial_name,
      reason: report.reason,
      details: report.details,
      decision: 'error',
      aiReason: '',
      timestamp: new Date().toISOString()
    };

    try {
      // Fetch the linked memorial
      const memorial = await getMemorialById(report.memorial_id);
      if (!memorial) {
        console.log('  ⚠️  Memorial not found — auto-dismissing orphaned report');
        result.decision = 'dismiss';
        result.aiReason = 'Memorial entry no longer exists — orphaned report auto-dismissed';
      } else {
        // Ask Gemini
        console.log('  🤖 Asking Gemini...');
        const { decision, reason } = await triageWithAI(report, memorial);
        result.decision = decision;
        result.aiReason = reason;
      }

      const emoji = result.decision === 'resolve' ? '✓ RESOLVED' : '✗ DISMISSED';
      console.log(`  ${emoji}: ${result.aiReason}`);

      if (!DRY_RUN) {
        let opResult: { success: boolean; error?: string };
        if (result.decision === 'resolve') {
          opResult = await resolveReport(report.id);
        } else {
          opResult = await dismissReport(report.id);
        }

        if (!opResult.success) {
          console.log(`  ❌ DB operation failed: ${opResult.error}`);
          result.decision = 'error';
          result.aiReason += ` (DB error: ${opResult.error})`;
          errors++;
        } else {
          if (result.decision === 'resolve') resolved++;
          else dismissed++;
        }
      } else {
        // Dry run — just count
        if (result.decision === 'resolve') resolved++;
        else dismissed++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  ❌ Error: ${msg}`);
      result.decision = 'error';
      result.aiReason = msg;
      errors++;
    }

    results.push(result);

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  // Save audit log
  saveAuditLog(results);

  // Summary
  console.log('\n═══════════════════════════════════════');
  console.log('📊 TRIAGE SUMMARY' + (DRY_RUN ? ' (DRY RUN)' : ''));
  console.log('═══════════════════════════════════════');
  console.log(`Total reports:   ${reports.length}`);
  console.log(`✓ Resolved:      ${resolved}`);
  console.log(`✗ Dismissed:     ${dismissed}`);
  console.log(`❌ Errors:       ${errors}`);
  console.log('═══════════════════════════════════════');

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN complete — re-run without --dry-run to apply decisions.');
  }
}

triageReports().catch(console.error);
