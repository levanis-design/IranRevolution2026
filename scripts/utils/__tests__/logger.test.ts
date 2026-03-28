import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../logger';

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Logger class', () => {
    it('should log info message via console.log', () => {
      logger.info('Test info message');
      expect(console.log).toHaveBeenCalledWith('Test info message');
      expect(console.log).toHaveBeenCalledTimes(1);
    });

    it('should log success message via console.log', () => {
      logger.success('Test success message');
      expect(console.log).toHaveBeenCalledWith('Test success message');
      expect(console.log).toHaveBeenCalledTimes(1);
    });

    it('should log warn message via console.log', () => {
      logger.warn('Test warn message');
      expect(console.log).toHaveBeenCalledWith('Test warn message');
      expect(console.log).toHaveBeenCalledTimes(1);
    });

    it('should log error message without error object via console.error', () => {
      logger.error('Test error message');
      expect(console.error).toHaveBeenCalledWith('Test error message');
      expect(console.error).toHaveBeenCalledTimes(1);
    });

    it('should log error message with error object via console.error', () => {
      const err = new Error('Test Error');
      logger.error('Test error message', err);
      expect(console.error).toHaveBeenCalledWith('Test error message', err);
      expect(console.error).toHaveBeenCalledTimes(1);
    });

    it('should log divider via console.log', () => {
      logger.divider();
      expect(console.log).toHaveBeenCalledWith('═══════════════════════════════════════');
      expect(console.log).toHaveBeenCalledTimes(1);
    });

    it('should log empty line via console.log', () => {
      logger.emptyLine();
      expect(console.log).toHaveBeenCalledWith();
      expect(console.log).toHaveBeenCalledTimes(1);
    });
  });
});
