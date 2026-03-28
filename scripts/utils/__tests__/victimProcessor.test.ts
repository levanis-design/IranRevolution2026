import { describe, it, expect } from 'vitest';
import { isRememberTheirNamesSource } from '../victimProcessor';
import { REMEMBER_THEIR_NAMES } from '../../config/discoveryConfig';

describe('victimProcessor', () => {
  describe('isRememberTheirNamesSource', () => {
    it('should return true for a URL ending with REMEMBER_THEIR_NAMES/', () => {
      const url = `https://t.me/s/${REMEMBER_THEIR_NAMES}/`;
      expect(isRememberTheirNamesSource(url)).toBe(true);
    });

    it('should return true for a URL containing REMEMBER_THEIR_NAMES/ in the middle', () => {
      const url = `https://t.me/s/${REMEMBER_THEIR_NAMES}/12345`;
      expect(isRememberTheirNamesSource(url)).toBe(true);
    });

    it('should return false for a URL that does not contain REMEMBER_THEIR_NAMES/', () => {
      const url = `https://t.me/s/SomeOtherChannel/`;
      expect(isRememberTheirNamesSource(url)).toBe(false);
    });

    it('should return false for a URL containing REMEMBER_THEIR_NAMES without the trailing slash', () => {
      const url = `https://t.me/s/${REMEMBER_THEIR_NAMES}`;
      expect(isRememberTheirNamesSource(url)).toBe(false);
    });

    it('should return false for an empty string', () => {
      expect(isRememberTheirNamesSource('')).toBe(false);
    });
  });
});
