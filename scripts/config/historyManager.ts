/**
 * History file management for discovery scripts
 * Tracks previously processed URLs to avoid duplicates
 */

import * as fs from 'fs';
import * as path from 'path';

const HISTORY_FILE = path.join(process.cwd(), 'scripts', 'discovery_history.json');

export function loadHistory(): Set<string> {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      return new Set(JSON.parse(data));
    }
  } catch (error) {
    console.error('Error loading history:', error);
  }
  return new Set();
}

export function saveHistory(history: Set<string>): void {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([...history], null, 2));
  } catch (error) {
    console.error('Error saving history:', error);
  }
}

export function getHistoryFilePath(): string {
  return HISTORY_FILE;
}
