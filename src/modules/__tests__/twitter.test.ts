import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initTwitter } from '../twitter';

describe('initTwitter', () => {
  const originalWindow = global.window;
  const originalDocument = global.document;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    global.window = originalWindow;
    global.document = originalDocument;
  });

  it('returns undefined if window is undefined', () => {
    // @ts-expect-error -- test mock override
    delete global.window;
    expect(initTwitter()).toBeUndefined();
  });

  it('returns existing twttr object if already loaded', () => {
    const existingTwttr = {
      ready: vi.fn(),
      widgets: { load: vi.fn() },
      _e: []
    };

    const mockDocument = {
      getElementsByTagName: vi.fn().mockReturnValue([{}]),
      getElementById: vi.fn().mockReturnValue({}),
      createElement: vi.fn()
    };

    // @ts-expect-error -- test mock override
    global.window = { twttr: existingTwttr };
    // @ts-expect-error -- test mock override
    global.document = mockDocument;

    const result = initTwitter();

    expect(result).toBe(existingTwttr);
    expect(mockDocument.getElementById).toHaveBeenCalledWith('twitter-wjs');
  });

  it('loads twitter script and initializes twttr object', () => {
    const mockInsertBefore = vi.fn();
    const mockFirstScript = {
      parentNode: {
        insertBefore: mockInsertBefore
      }
    };

    const mockScriptElement = {
      id: '',
      src: ''
    };

    const mockDocument = {
      getElementsByTagName: vi.fn().mockReturnValue([mockFirstScript]),
      getElementById: vi.fn().mockReturnValue(null),
      createElement: vi.fn().mockReturnValue(mockScriptElement)
    };

    // @ts-expect-error -- test mock override
    global.window = {};
    // @ts-expect-error -- test mock override
    global.document = mockDocument;

    const result = initTwitter();

    // Verify script creation and insertion
    expect(mockDocument.createElement).toHaveBeenCalledWith('script');
    expect(mockScriptElement.id).toBe('twitter-wjs');
    expect(mockScriptElement.src).toBe('https://platform.twitter.com/widgets.js');
    expect(mockInsertBefore).toHaveBeenCalledWith(mockScriptElement, mockFirstScript);

    // Verify twttr object initialization
    expect(result).toBeDefined();
    expect(result?._e).toEqual([]);
    expect(typeof result?.ready).toBe('function');

    // Verify window.twttr is set
    expect((global.window as unknown as Record<string, unknown>)['twttr']).toBe(result);

    // Verify ready callback
    const mockCallback = vi.fn();
    result?.ready(mockCallback);
    expect(result?._e).toContain(mockCallback);
  });

  it('handles case where no first script exists gracefully', () => {
    const mockScriptElement = {
      id: '',
      src: ''
    };

    const mockDocument = {
      getElementsByTagName: vi.fn().mockReturnValue([]),
      getElementById: vi.fn().mockReturnValue(null),
      createElement: vi.fn().mockReturnValue(mockScriptElement)
    };

    // @ts-expect-error -- test mock override
    global.window = {};
    // @ts-expect-error -- test mock override
    global.document = mockDocument;

    // Should not throw
    expect(() => initTwitter()).not.toThrow();
  });
});
