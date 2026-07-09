/** Префикс всех REST-эндпоинтов: /api/... */
export const API_PREFIX = 'api';

/** Ответ GET /api/healthz */
export interface HealthzResponse {
  status: 'ok';
  uptimeSeconds: number;
  timestamp: string;
}
