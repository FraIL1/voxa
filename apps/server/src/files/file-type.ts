/**
 * Определение типа файла по магическим байтам (раздел 9 PRD: тип — по
 * содержимому, не по расширению; исполняемые файлы запрещены).
 */

export interface DetectedMedia {
  mime: string;
  /** Каноническое расширение */
  ext: string;
  isImage: boolean;
}

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

function ascii(buf: Buffer, text: string, offset = 0): boolean {
  return startsWith(
    buf,
    [...text].map((c) => c.charCodeAt(0)),
    offset,
  );
}

/** Известные медиатипы, которые показываем инлайн */
export function detectMedia(buf: Buffer): DetectedMedia | null {
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47]))
    return { mime: 'image/png', ext: 'png', isImage: true };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: 'jpg', isImage: true };
  if (ascii(buf, 'GIF87a') || ascii(buf, 'GIF89a'))
    return { mime: 'image/gif', ext: 'gif', isImage: true };
  if (ascii(buf, 'RIFF') && ascii(buf, 'WEBP', 8))
    return { mime: 'image/webp', ext: 'webp', isImage: true };

  if (ascii(buf, 'ftyp', 4)) return { mime: 'video/mp4', ext: 'mp4', isImage: false };
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3]))
    return { mime: 'video/webm', ext: 'webm', isImage: false };

  if (ascii(buf, 'ID3') || startsWith(buf, [0xff, 0xfb]) || startsWith(buf, [0xff, 0xf3])) {
    return { mime: 'audio/mpeg', ext: 'mp3', isImage: false };
  }
  if (ascii(buf, 'OggS')) return { mime: 'audio/ogg', ext: 'ogg', isImage: false };
  if (ascii(buf, 'RIFF') && ascii(buf, 'WAVE', 8))
    return { mime: 'audio/wav', ext: 'wav', isImage: false };

  if (ascii(buf, '%PDF')) return { mime: 'application/pdf', ext: 'pdf', isImage: false };

  return null;
}

const EXECUTABLE_EXTENSIONS = new Set([
  'exe',
  'dll',
  'msi',
  'com',
  'scr',
  'pif',
  'cpl',
  'bat',
  'cmd',
  'ps1',
  'psm1',
  'vbs',
  'vbe',
  'js',
  'jse',
  'wsf',
  'wsh',
  'hta',
  'sh',
  'bash',
  'zsh',
  'run',
  'bin',
  'jar',
  'apk',
  'appimage',
  'deb',
  'rpm',
  'dmg',
  'app',
]);

/** Исполняемый файл: по магическим байтам ИЛИ по расширению */
export function isExecutable(buf: Buffer, fileName: string): boolean {
  // PE (Windows), ELF (Linux), Mach-O (macOS: 4 варианта + universal), скрипты
  if (ascii(buf, 'MZ')) return true;
  if (startsWith(buf, [0x7f, 0x45, 0x4c, 0x46])) return true;
  if (
    startsWith(buf, [0xfe, 0xed, 0xfa, 0xce]) ||
    startsWith(buf, [0xfe, 0xed, 0xfa, 0xcf]) ||
    startsWith(buf, [0xce, 0xfa, 0xed, 0xfe]) ||
    startsWith(buf, [0xcf, 0xfa, 0xed, 0xfe]) ||
    // universal binary; тот же magic у java class — тоже блокируем
    startsWith(buf, [0xca, 0xfe, 0xba, 0xbe])
  ) {
    return true;
  }
  if (ascii(buf, '#!')) return true;

  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return EXECUTABLE_EXTENSIONS.has(ext);
}
