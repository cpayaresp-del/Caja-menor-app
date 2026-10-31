import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : 'info',
  ...(config.NODE_ENV !== 'production' ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {})
});
