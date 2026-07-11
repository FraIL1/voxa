import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LinkPreviewDto } from '@voxa/shared';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import type { Env } from '../config/env';

const FETCH_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/u;

/** Приватные/служебные диапазоны — защита от SSRF (раздел 9 PRD) */
function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const parts = address.split('.').map(Number);
    const [a = 0, b = 0] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local и облачная metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224 // multicast и зарезервированные
    );
  }
  const lower = address.toLowerCase();
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') || // ULA fc00::/7
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb') || // link-local fe80::/10
    lower.startsWith('::ffff:') // v4-mapped — не резолвим вручную, блокируем
  );
}

async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('приватный адрес');
    return;
  }
  const records = await lookup(host, { all: true, verbatim: true });
  if (records.length === 0) throw new Error('DNS не разрешился');
  if (records.some((r) => isPrivateAddress(r.address))) {
    throw new Error('приватный адрес за DNS-именем');
  }
}

function firstMeta(html: string, property: string): string | null {
  // Оба порядка атрибутов: property→content и content→property
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`, 'i'),
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]) return match[1];
  }
  return null;
}

function decodeEntities(text: string): string {
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&nbsp;', ' ')
    .trim();
}

@Injectable()
export class LinkPreviewService {
  private readonly logger = new Logger(LinkPreviewService.name);
  private readonly enabled: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.enabled = config.get('LINK_PREVIEW', { infer: true }) === 'on';
  }

  extractFirstUrl(content: string): string | null {
    // Ссылки внутри `кода` не разворачиваем
    const withoutCode = content.replace(/`[^`]*`/g, ' ');
    return withoutCode.match(URL_RE)?.[0] ?? null;
  }

  /** null — превью нет (не HTML, нет метаданных, недоступно или запрещено) */
  async fetchPreview(rawUrl: string): Promise<LinkPreviewDto | null> {
    if (!this.enabled) return null;
    try {
      let url = new URL(rawUrl);
      let response: Response | null = null;

      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        await assertPublicHost(url);

        response = await fetch(url, {
          redirect: 'manual',
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          headers: {
            'User-Agent': 'VoxaBot/0.1 (+link-preview)',
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'ru,en;q=0.8',
          },
        });

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) return null;
          url = new URL(location, url);
          continue;
        }
        break;
      }
      if (!response || !response.ok) return null;
      if (!(response.headers.get('content-type') ?? '').includes('text/html')) return null;

      // Читаем не больше MAX_BODY_BYTES
      const reader = response.body?.getReader();
      if (!reader) return null;
      const chunks: Buffer[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        chunks.push(Buffer.from(value));
        if (total >= MAX_BODY_BYTES) {
          await reader.cancel().catch(() => undefined);
          break;
        }
      }
      const html = Buffer.concat(chunks).toString('utf8');

      const title =
        firstMeta(html, 'og:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? null;
      if (!title || !title.trim()) return null;

      const image = firstMeta(html, 'og:image');
      return {
        url: url.toString(),
        title: decodeEntities(title).slice(0, 200),
        description: (() => {
          const d = firstMeta(html, 'og:description') ?? firstMeta(html, 'description');
          return d ? decodeEntities(d).slice(0, 300) : null;
        })(),
        imageUrl: image ? new URL(image, url).toString().slice(0, 1000) : null,
        siteName: (() => {
          const s = firstMeta(html, 'og:site_name');
          return s ? decodeEntities(s).slice(0, 100) : null;
        })(),
      };
    } catch (error) {
      this.logger.debug(`Превью для ${rawUrl} не получено: ${(error as Error).message}`);
      return null;
    }
  }
}
