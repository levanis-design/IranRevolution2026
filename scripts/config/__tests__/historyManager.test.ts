import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { loadHistory, saveHistory, getHistoryFilePath } from '../historyManager';

// Mock the fs module completely
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

describe('historyManager', () => {
  const historyFile = path.join(process.cwd(), 'scripts', 'discovery_history.json');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadHistory', () => {
    it('returns an empty Set when the history file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = loadHistory();

      expect(fs.existsSync).toHaveBeenCalledWith(historyFile);
      expect(fs.readFileSync).not.toHaveBeenCalled();
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it('returns a populated Set when the history file exists and contains valid JSON array', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('["url1", "url2"]');

      const result = loadHistory();

      expect(fs.existsSync).toHaveBeenCalledWith(historyFile);
      expect(fs.readFileSync).toHaveBeenCalledWith(historyFile, 'utf8');
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(2);
      expect(result.has('url1')).toBe(true);
      expect(result.has('url2')).toBe(true);
    });

    it('returns an empty Set and logs an error when readFileSync throws an error', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const error = new Error('Read error');
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw error;
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = loadHistory();

      expect(consoleSpy).toHaveBeenCalledWith('Error loading history:', error);
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it('returns an empty Set and logs an error when JSON parsing fails', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json');

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = loadHistory();

      expect(consoleSpy).toHaveBeenCalled(); // Should be called with SyntaxError
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });
  });

  describe('saveHistory', () => {
    it('writes stringified JSON array to the history file', () => {
      const historySet = new Set(['url1', 'url2']);

      saveHistory(historySet);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        historyFile,
        JSON.stringify(['url1', 'url2'], null, 2)
      );
    });

    it('logs an error when writeFileSync throws an error', () => {
      const historySet = new Set(['url1']);
      const error = new Error('Write error');
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw error;
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      saveHistory(historySet);

      expect(consoleSpy).toHaveBeenCalledWith('Error saving history:', error);
    });
  });

  describe('getHistoryFilePath', () => {
    it('returns the correct path to the history file', () => {
      const expectedPath = path.join(process.cwd(), 'scripts', 'discovery_history.json');
      expect(getHistoryFilePath()).toBe(expectedPath);
    });
  });
});
