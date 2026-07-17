import type { AuthResponseDto, LoginInput, RegisterInput } from '@voxa/shared';

import { useAuthStore } from '../stores/auth';
import { api } from './client';

export async function login(input: LoginInput): Promise<void> {
  const data = await api<AuthResponseDto>('/auth/login', { method: 'POST', body: input });
  useAuthStore.getState().setSession(data.accessToken, data.user);
}

export async function register(input: RegisterInput): Promise<void> {
  const data = await api<AuthResponseDto>('/auth/register', { method: 'POST', body: input });
  useAuthStore.getState().setSession(data.accessToken, data.user);
}

export async function logout(): Promise<void> {
  // Выход из голосового канала до разрыва сессии — LiveKit-соединение
  // socket.io не трогает, его надо закрывать явно
  const { useVoiceStore } = await import('../stores/voice');
  await useVoiceStore
    .getState()
    .leave()
    .catch(() => undefined);

  try {
    await api<void>('/auth/logout', { method: 'POST' });
  } finally {
    useAuthStore.getState().clearSession();
  }
}
