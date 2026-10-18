const GREETINGS_BY_NATIONALITY: Record<string, string> = {
  arabic: 'Ahlan',
  egyptian: 'Ahlan',
  egypt: 'Ahlan',
  french: 'Bonjour',
  france: 'Bonjour',
  german: 'Hallo',
  germany: 'Hallo',
  italian: 'Ciao',
  italy: 'Ciao',
  portuguese: 'Olá',
  brazilian: 'Olá',
  brazil: 'Olá',
  spanish: 'Hola',
  british: 'Hello',
  english: 'Hello',
  american: 'Hello',
  australian: 'Hello',
  canadian: 'Hello',
  dutch: 'Hallo',
  belgian: 'Hallo',
  swiss: 'Hallo',
  turkish: 'Merhaba',
  greek: 'Γεια σας',
  russian: 'Здравствуйте',
  ukrainian: 'Вітаю',
  polish: 'Cześć',
  czech: 'Ahoj',
  slovak: 'Ahoj',
  romanian: 'Salut',
  hungarian: 'Szia',
  swedish: 'Hej',
  norwegian: 'Hei',
  danish: 'Hej',
  finnish: 'Hei',
  indian: 'नमस्ते',
  hindi: 'नमस्ते',
  pakistani: 'السلام علیکم',
  bangladeshi: 'নমস্কার',
  chinese: '你好',
  japanese: 'こんにちは',
  korean: '안녕하세요',
  vietnamese: 'Xin chào',
  thai: 'สวัสดี',
  indonesian: 'Halo',
  malaysian: 'Helo',
  filipino: 'Kamusta',
  southafrican: 'Hello',
  nigerian: 'Hello',
  kenyan: 'Hello',
  moroccan: 'Ahlan',
  algerian: 'Ahlan',
  tunisian: 'Ahlan',
  jordanian: 'Ahlan',
  lebanese: 'Ahlan',
  saudi: 'Ahlan',
  emirates: 'Ahlan',
  emirati: 'Ahlan',
  qatari: 'Ahlan',
  kuwaiti: 'Ahlan',
  bahraini: 'Ahlan',
  omani: 'Ahlan',
};

function normalizeNationality(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function greetingForNationality(nationality: string): string {
  const normalized = normalizeNationality(nationality);
  return GREETINGS_BY_NATIONALITY[normalized] ?? 'Hello';
}

export interface NationalityGreeting {
  nationality: string;
  greeting: string;
  attendeeCount: number;
}
