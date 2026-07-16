import { Injectable } from '@nestjs/common';
import type { VoiceChannelStateDto, VoiceParticipantDto } from '@voxa/shared';

interface VoiceState {
  channelId: string;
  participant: VoiceParticipantDto;
}

/**
 * Кто сейчас в каких голосовых каналах. Источник истины — этот сервис
 * (один инстанс Node на 30 человек, раздел 8.6 PRD): клиент сообщает
 * состояние через WS-событие voice.state, при разрыве сокета состояние
 * снимается автоматически.
 */
@Injectable()
export class VoiceStateService {
  /** userId → текущее голосовое состояние */
  private readonly states = new Map<string, VoiceState>();

  /**
   * Обновляет состояние пользователя; channelId=null — выход из голоса.
   * Возвращает затронутые каналы (старый при переходе/выходе + новый).
   */
  update(
    userId: string,
    username: string,
    channelId: string | null,
    muted: boolean,
    deafened: boolean,
  ): string[] {
    const affected = new Set<string>();
    const previous = this.states.get(userId);
    if (previous) affected.add(previous.channelId);

    if (channelId === null) {
      this.states.delete(userId);
    } else {
      this.states.set(userId, {
        channelId,
        participant: { userId, username, muted, deafened },
      });
      affected.add(channelId);
    }
    return [...affected];
  }

  /** Смена имени пользователя в голосе; вернёт канал для рассылки или null */
  rename(userId: string, username: string): string | null {
    const state = this.states.get(userId);
    if (!state) return null;
    state.participant = { ...state.participant, username };
    return state.channelId;
  }

  /** Снятие состояния при разрыве последнего сокета; вернёт покинутый канал */
  drop(userId: string): string | null {
    const state = this.states.get(userId);
    if (!state) return null;
    this.states.delete(userId);
    return state.channelId;
  }

  participantsOf(channelId: string): VoiceParticipantDto[] {
    const result: VoiceParticipantDto[] = [];
    for (const state of this.states.values()) {
      if (state.channelId === channelId) result.push(state.participant);
    }
    return result;
  }

  /** Все непустые голосовые каналы (начальная загрузка клиента) */
  all(): VoiceChannelStateDto[] {
    const byChannel = new Map<string, VoiceParticipantDto[]>();
    for (const state of this.states.values()) {
      const list = byChannel.get(state.channelId) ?? [];
      list.push(state.participant);
      byChannel.set(state.channelId, list);
    }
    return [...byChannel.entries()].map(([channelId, participants]) => ({
      channelId,
      participants,
    }));
  }
}
