import type { AuthResponseDto } from '@voxa/shared';

import { useAuthStore } from '../stores/auth';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Единый refresh на все параллельные 401 (single-flight) */
let refreshInFlight: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    const attempt = async (): Promise<boolean> => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        if (!res.ok) return false;
        const data = (await res.json()) as AuthResponseDto;
        useAuthStore.getState().setSession(data.accessToken, data.user);
        return true;
      } catch {
        return false;
      }
    };

    if (await attempt()) return true;
    // Гонка вкладок: другая вкладка могла обновить cookie — пробуем ещё раз
    await new Promise((resolve) => setTimeout(resolve, 400));
    return attempt();
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Служебное: запрет повторного refresh-ретрая */
  _noRetry?: boolean;
}

interface ErrorBody {
  message?: string | string[];
}

/**
 * Обёртка над fetch: Bearer-токен, JSON, авто-refresh по 401 с одним
 * повтором запроса. Пути — без префикса /api.
 */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: {
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && !options._noRetry) {
    if (await refreshSession()) {
      return api<T>(path, { ...options, _noRetry: true });
    }
    useAuthStore.getState().clearSession();
  }

  if (!res.ok) {
    let details: ErrorBody | undefined;
    try {
      details = (await res.json()) as ErrorBody;
    } catch {
      // тело не JSON — оставляем детали пустыми
    }
    const message = Array.isArray(details?.message)
      ? details.message.join(', ')
      : (details?.message ?? `Ошибка ${res.status}`);
    throw new ApiError(res.status, message, details);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
