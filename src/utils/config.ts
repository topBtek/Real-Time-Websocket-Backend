/**
 * Configuration management with environment variables
 */

import { logger } from './logger.js';
import type { RateLimitConfig } from '../types/index.js';

export interface Config {
  port: number;
  authSecret: string;
  wsPath: string;
  allowedOrigins: string[];
  rateLimit: RateLimitConfig;
  redis?: {
    url: string;
    enabled: boolean;
  };
}

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (!value && !defaultValue) {
    logger.warn(`Environment variable ${name} not set, using default or failing`);
  }
  return value || defaultValue || '';
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

export const config: Config = {
  port: parseNumber(process.env.PORT, 3000),
  authSecret: getEnvVar('AUTH_SECRET', 'change-me-in-production'),
  wsPath: process.env.WS_PATH || '/ws',
  allowedOrigins:
    process.env.ALLOWED_ORIGINS === '*'
      ? ['*']
      : (process.env.ALLOWED_ORIGINS || '*').split(',').map((o) => o.trim()),
  rateLimit: {
    connectionLimitPerIp: parseNumber(process.env.CONNECTION_LIMIT_PER_IP, 10),
    channelLimitPerConnection: parseNumber(process.env.CHANNEL_LIMIT_PER_CONNECTION, 50),
    messageRateLimit: parseNumber(process.env.MESSAGE_RATE_LIMIT, 100),
    messageRateWindowMs: parseNumber(process.env.MESSAGE_RATE_WINDOW_MS, 60000),
  },
  redis: {
    url: getEnvVar('REDIS_URL', ''),
    enabled: parseBoolean(process.env.REDIS_ENABLED, false),
  },
};

// Validate critical config
if (config.authSecret === 'change-me-in-production' && process.env.NODE_ENV === 'production') {
  logger.error('AUTH_SECRET must be set in production!');
  process.exit(1);
}

logger.info({ config: { ...config, authSecret: '[REDACTED]' } }, 'Configuration loaded');
