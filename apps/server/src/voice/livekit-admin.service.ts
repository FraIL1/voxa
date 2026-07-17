import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoomServiceClient } from 'livekit-server-sdk';

import type { Env } from '../config/env';

/**
 * Серверное управление комнатами LiveKit: выкинуть участника (кик/бан),
 * запретить публикацию звука (таймаут). Ошибки глотаются: участника может
 * уже не быть в комнате — это не повод ронять модерацию.
 */
@Injectable()
export class LiveKitAdminService {
  private readonly client: RoomServiceClient;
  private readonly logger = new Logger(LiveKitAdminService.name);

  constructor(config: ConfigService<Env, true>) {
    // Server API ходит по http(s) на тот же порт, что и ws(s)-сигналинг
    const url = config.get('PUBLIC_LIVEKIT_URL', { infer: true }).replace(/^ws/, 'http');
    this.client = new RoomServiceClient(
      url,
      config.get('LIVEKIT_API_KEY', { infer: true }),
      config.get('LIVEKIT_API_SECRET', { infer: true }),
    );
  }

  async removeFromRoom(channelId: string, userId: string): Promise<void> {
    await this.client
      .removeParticipant(channelId, userId)
      .catch((error: Error) => this.logger.debug(`removeParticipant: ${error.message}`));
  }

  /** canPublish=false отбирает микрофон на уровне SFU — размутиться нельзя */
  async setCanPublish(channelId: string, userId: string, canPublish: boolean): Promise<void> {
    await this.client
      .updateParticipant(channelId, userId, undefined, {
        canPublish,
        canSubscribe: true,
        canPublishData: true,
      })
      .catch((error: Error) => this.logger.debug(`updateParticipant: ${error.message}`));
  }
}
