import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Эндпоинт доступен без JWT (healthz, register, login, refresh) */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
