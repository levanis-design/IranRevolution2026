/**
 * Configuration file for discovery scripts
 * Contains target URLs, keywords, and constants
 */

export const TARGETS = [
  'https://x.com/maroofian_n',
  'https://hengaw.net/fa/news/2026/01/article-138-1',
  'https://x.com/IranRights_org',
  'https://x.com/indypersian',
  'https://x.com/IranIntl_En',
  'https://x.com/HyrcaniHRM',
  'https://x.com/allahbakhshii',
  'https://x.com/Tavaana',
  'https://x.com/HoHossein',
  'https://x.com/LoabatK',
  'https://x.com/isamanyasin',
  'https://x.com/longlosthills',
  'https://x.com/iranwire',
  'https://x.com/HengawO',
  'https://x.com/1500tasvir',
  'https://x.com/AmnestyIran',
  'https://x.com/ICHRI',
  'https://x.com/FSeifikaran',
  'https://x.com/dadban4',
  'https://x.com/Daikatuo',
  'https://x.com/pouriazeraati',
  'https://x.com/S_iran01',
  'https://x.com/MonfaredAshkan',
  'https://t.me/s/RememberTheirNames',
  'https://x.com/search?q=%D8%AC%D8%A7%D9%86%D8%A8%D8%A7%D8%AE%D8%AA%D9%87%20%D8%A7%DB%8C%D8%B1%D8%A7%D9%86&f=live', // "جانباخته ایران" (Died Iran)
  'https://x.com/search?q=%DA%A9%D8%B4%D8%AA%D9%87%20%D8%B4%D8%AF&f=live', // "کشته شد" (Was killed)
] as const;

/**
 * Keywords that must be present in the content for it to be considered relevant.
 * This helps filter out sidebar content or unrelated news from search results.
 */
export const RELEVANCE_KEYWORDS = [
  'کشته شد', 'جانباخته', 'اعدام', 'بازداشت', 'زندانی', 'اعتراضات',
  'شهید', 'مجروح', 'تیراندازی', 'شکنجه', 'حقوق بشر', 'ایران',
  'killed', 'arrested', 'executed', 'prison', 'protest', 'torture', 'human rights', 'iran'
] as const;

export const REMEMBER_THEIR_NAMES = 'RememberTheirNames';
export const JINA_AI_READER_URL = 'https://r.jina.ai';
export const REQUEST_DELAY_MS = 2000;
export const MAX_CONSECUTIVE_EMPTY = 50;
