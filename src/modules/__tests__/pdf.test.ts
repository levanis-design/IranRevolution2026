import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import QRCode from 'qrcode';
import html2pdf from 'html2pdf.js';
import { downloadMemorialPdf } from '../pdf';
import * as i18n from '../i18n';
import type { MemorialEntry } from '../types';

// Mock dependencies
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(),
  },
}));

vi.mock('html2pdf.js', () => {
  const saveMock = vi.fn().mockResolvedValue(undefined);
  const fromMock = vi.fn().mockReturnValue({ save: saveMock });
  const setMock = vi.fn().mockReturnValue({ from: fromMock });
  return {
    default: vi.fn().mockReturnValue({ set: setMock }),
  };
});

vi.mock('../i18n', () => ({
  t: vi.fn((key: string) => `mock_${key}`),
  currentLanguage: vi.fn(),
}));

describe('downloadMemorialPdf', () => {
  const mockEntry: MemorialEntry = {
    id: '123',
    name: 'Test Name',
    name_fa: 'نام تستی',
    city: 'Test City',
    city_fa: 'شهر تستی',
    location: 'Test Location',
    date: '2022-09-16T00:00:00.000Z',
    bio: 'Test bio content.',
    bio_fa: 'محتوای بیو تستی.',
    media: {
      photo: 'test.jpg'
    }
  };

  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let alertSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock window.location for test
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://test.com', pathname: '/path' },
      writable: true,
      configurable: true,
    });

    // Mock QRCode
    vi.mocked(QRCode.toDataURL).mockResolvedValue('mock-qr-data-url' as unknown as void);

    // Default to English
    vi.mocked(i18n.currentLanguage).mockReturnValue('en' as 'en' | 'fa');

    // Spies for error handling
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('generates PDF with English properties and LTR direction', async () => {
    await downloadMemorialPdf(mockEntry);

    // Verify QRCode generation
    expect(QRCode.toDataURL).toHaveBeenCalledWith(
      'https://test.com/path?id=123',
      expect.objectContaining({ margin: 1, width: 120 })
    );

    // Verify html2pdf chain
    const html2pdfInstance = html2pdf();
    expect(html2pdf).toHaveBeenCalled();
    expect(html2pdfInstance.set).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'Test_Name_Protest_Poster.pdf',
        margin: 0,
        image: { type: 'jpeg', quality: 1.0 },
      })
    );

    const setObj = vi.mocked(html2pdfInstance.set).mock.results[0].value;
    expect(setObj.from).toHaveBeenCalled();

    const element = vi.mocked(setObj.from).mock.calls[0][0] as HTMLElement;
    expect(element.tagName).toBe('DIV');
    expect(element.innerHTML).toContain('Test Name');
    expect(element.innerHTML).toContain('Test City');
    expect(element.innerHTML).toContain('Test bio content.');
    expect(element.innerHTML).toContain('direction: ltr'); // Should be ltr for English

    const fromObj = vi.mocked(setObj.from).mock.results[0].value;
    expect(fromObj.save).toHaveBeenCalled();
  });

  it('generates PDF with Persian properties and RTL direction', async () => {
    vi.mocked(i18n.currentLanguage).mockReturnValue('fa' as 'en' | 'fa');

    await downloadMemorialPdf(mockEntry);

    const html2pdfInstance = html2pdf();
    expect(html2pdfInstance.set).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'نام_تستی_Protest_Poster.pdf',
      })
    );

    const setObj = vi.mocked(html2pdfInstance.set).mock.results[0].value;
    const element = vi.mocked(setObj.from).mock.calls[0][0] as HTMLElement;

    expect(element.innerHTML).toContain('نام تستی');
    expect(element.innerHTML).toContain('شهر تستی');
    expect(element.innerHTML).toContain('محتوای بیو تستی.');
    expect(element.innerHTML).toContain('direction: rtl'); // Should be rtl for Persian
  });

  it('falls back to English properties if Persian properties are missing in FA mode', async () => {
    vi.mocked(i18n.currentLanguage).mockReturnValue('fa' as 'en' | 'fa');

    const partialEntry: MemorialEntry = {
      id: '124',
      name: 'Fallback Name',
      city: 'Fallback City',
      location: 'Fallback Location',
      date: '2022-09-16T00:00:00.000Z',
      bio: 'Fallback bio.'
    };

    await downloadMemorialPdf(partialEntry);

    const html2pdfInstance = html2pdf();
    expect(html2pdfInstance.set).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'Fallback_Name_Protest_Poster.pdf',
      })
    );

    const setObj = vi.mocked(html2pdfInstance.set).mock.results[0].value;
    const element = vi.mocked(setObj.from).mock.calls[0][0] as HTMLElement;

    expect(element.innerHTML).toContain('Fallback Name');
    expect(element.innerHTML).toContain('Fallback City');
    expect(element.innerHTML).toContain('Fallback bio.');
  });

  it('handles html2pdf errors gracefully', async () => {
    const error = new Error('PDF Error');

    // Override the mock for this test
    const saveMock = vi.fn().mockRejectedValue(error);
    const fromMock = vi.fn().mockReturnValue({ save: saveMock });
    const setMock = vi.fn().mockReturnValue({ from: fromMock });
    vi.mocked(html2pdf).mockReturnValueOnce({ set: setMock } as unknown as ReturnType<typeof html2pdf>);

    await downloadMemorialPdf(mockEntry);

    expect(consoleErrorSpy).toHaveBeenCalledWith('PDF generation failed:', error);
    expect(alertSpy).toHaveBeenCalledWith('Failed to generate PDF. Please try again.');
  });
});
