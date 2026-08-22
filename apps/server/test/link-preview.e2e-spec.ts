import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fetch } from 'undici';

import { isPrivateAddress, pinnedAgent } from '../src/link-preview/link-preview.service';

/*
 * Защита предпросмотра ссылок от SSRF.
 *
 * Предпросмотр ходит по ссылке, которую прислал кто угодно, поэтому он —
 * готовый способ заставить наш сервер постучаться во внутреннюю сеть.
 * Защита стоит на двух ногах: не пускать на приватные адреса и соединяться
 * строго по уже проверенному адресу. Обе проверяем напрямую: это решения о
 * безопасности, и подтверждать их косвенными признаками нельзя.
 */
describe('Предпросмотр ссылок: защита от SSRF', () => {
  it('приватные и служебные адреса считаются закрытыми', () => {
    const blocked = [
      '127.0.0.1', // сам сервер
      '0.0.0.0',
      '10.1.2.3', // частная сеть
      '172.16.0.1', // частная сеть
      '172.31.255.255',
      '192.168.1.1', // домашняя сеть
      '169.254.169.254', // метаданные облака — самая лакомая цель
      '100.64.0.1', // CGNAT
      '224.0.0.1', // multicast
      '::1',
      'fd00::1', // ULA
      'fe80::1', // link-local
      '::ffff:127.0.0.1', // v4 внутри v6
    ];
    for (const address of blocked) {
      expect([address, isPrivateAddress(address)]).toEqual([address, true]);
    }
  });

  it('обычные адреса в интернете не блокируются', () => {
    // Иначе «защита» могла бы просто запрещать всё подряд и выглядеть рабочей
    const allowed = ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '2606:4700::1111'];
    for (const address of allowed) {
      expect([address, isPrivateAddress(address)]).toEqual([address, false]);
    }
  });

  /*
   * Главная проверка: соединение обязано идти на проверенный адрес, а не на
   * тот, который выдаст DNS во второй раз. Берём заведомо несуществующее имя
   * — если запрос всё же дошёл до нашего сервера, значит адрес закреплён и
   * повторного обращения к DNS не было.
   */
  it('соединение идёт по закреплённому адресу, а не по имени из DNS', async () => {
    const server: Server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('дошли до закреплённого адреса');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    try {
      const response = await fetch(`http://never-resolves.invalid:${port}/`, {
        dispatcher: pinnedAgent('127.0.0.1'),
        signal: AbortSignal.timeout(5000),
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('дошли до закреплённого адреса');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
