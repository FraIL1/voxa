import type { AttachmentDto } from '@voxa/shared';

import { useAuthStore } from '../stores/auth';
import { refreshSession } from './client';

interface ErrorBody {
  message?: string | string[];
}

/** Загрузка одного файла (multipart); повтор после refresh при 401 */
export async function uploadFile(file: File, retry = true): Promise<AttachmentDto> {
  const token = useAuthStore.getState().accessToken;
  const form = new FormData();
  form.append('file', file, file.name);

  const res = await fetch('/api/uploads', {
    method: 'POST',
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (res.status === 401 && retry && (await refreshSession())) {
    return uploadFile(file, false);
  }
  if (!res.ok) {
    let message = `Ошибка ${res.status}`;
    try {
      const body = (await res.json()) as ErrorBody;
      if (typeof body.message === 'string') message = body.message;
    } catch {
      // тело не JSON
    }
    throw new Error(message);
  }
  return (await res.json()) as AttachmentDto;
}
