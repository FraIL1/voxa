import { PrismaClient } from '@prisma/client';

import { TEST_DB_URL } from '../../playwright.config';
import { expect, test } from './fixtures';
import { OWNER } from './global-setup';

/**
 * Подписи с датой между днями переписки. Сообщения раскладываем по разным
 * суткам прямо в базе стенда: через приложение отправить «вчерашнее»
 * сообщение нельзя — время ставит сервер.
 *
 * Канал заводим свой, ничего существующего не трогаем.
 */
test('в переписке видны подписи «Сегодня», «Вчера» и дата', async ({ owner }) => {
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });

  try {
    const author = await prisma.user.findFirstOrThrow({
      where: { usernameLower: OWNER.username },
    });
    const guild = await prisma.guild.findFirstOrThrow({
      where: { ownerId: author.id },
      orderBy: { createdAt: 'asc' },
    });
    const channel = await prisma.channel.create({
      data: { guildId: guild.id, name: `даты-${Date.now()}`, type: 'TEXT', position: 90 },
    });

    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    await prisma.message.createMany({
      data: [
        {
          channelId: channel.id,
          authorId: author.id,
          content: 'Сообщение пятидневной давности',
          createdAt: new Date(now - 5 * day),
        },
        {
          channelId: channel.id,
          authorId: author.id,
          content: 'Вчерашнее сообщение',
          createdAt: new Date(now - day),
        },
        {
          channelId: channel.id,
          authorId: author.id,
          content: 'Сегодняшнее сообщение',
          createdAt: new Date(now),
        },
      ],
    });

    await owner.goto(`/guilds/${guild.id}/channels/${channel.id}`);
    await expect(owner.locator('.message-list .message')).toHaveCount(3);

    const labels = await owner.locator('.message-list .day-sep span').allInnerTexts();
    expect(labels).toHaveLength(3);
    // Самая старая — обычная дата, а не «Сегодня»/«Вчера»
    expect(labels[0]).toMatch(/^\d{1,2} [а-я]+$/);
    expect(labels[1]).toBe('Вчера');
    expect(labels[2]).toBe('Сегодня');

    // Подпись стоит над сообщениями своего дня, а не под ними
    await expect(owner.locator('.message-list > *').first()).toHaveClass(/day-sep/);

    await owner.locator('.message-list').screenshot({
      path: 'tests/ui/artifacts/day-separator.png',
    });
  } finally {
    await prisma.$disconnect();
  }
});
