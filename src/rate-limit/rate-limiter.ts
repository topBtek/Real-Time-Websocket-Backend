/**
 * Rate limiting using token bucket algorithm
 */

import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';
import type { RateLimitConfig } from '../types/index.js';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number; // tokens per millisecond
}

interface ConnectionRateLimit {
  messageCount: number;
  windowStart: number;
}

class RateLimiter {
  private connectionLimits: Map<string, number> = new Map(); // IP -> connection count
  private messageBuckets: Map<string, TokenBucket> = new Map(); // socketId -> bucket
  private connectionRateLimits: Map<string, ConnectionRateLimit> = new Map(); // socketId -> rate limit

  /**
   * Check if IP can create new connection
   */
  canConnect(ip: string): boolean {
    const current = this.connectionLimits.get(ip) || 0;
    const limit = config.rateLimit.connectionLimitPerIp;
    
    if (current >= limit) {
      logger.warn({ ip, current, limit }, 'Connection limit exceeded for IP');
      return false;
    }
    
    return true;
  }

  /**
   * Increment connection count for IP
   */
  addConnection(ip: string): void {
    const current = this.connectionLimits.get(ip) || 0;
    this.connectionLimits.set(ip, current + 1);
  }

  /**
   * Decrement connection count for IP
   */
  removeConnection(ip: string): void {
    const current = this.connectionLimits.get(ip) || 0;
    if (current > 0) {
      this.connectionLimits.set(ip, current - 1);
      if (current === 1) {
        this.connectionLimits.delete(ip);
      }
    }
  }

  /**
   * Check if socket can send message (rate limit)
   */
  canSendMessage(socketId: string): boolean {
    const now = Date.now();
    const limit = this.connectionRateLimits.get(socketId);

    if (!limit) {
      // Initialize rate limit tracking
      this.connectionRateLimits.set(socketId, {
        messageCount: 1,
        windowStart: now,
      });
      return true;
    }

    // Reset window if expired
    if (now - limit.windowStart > config.rateLimit.messageRateWindowMs) {
      limit.messageCount = 1;
      limit.windowStart = now;
      return true;
    }

    // Check if limit exceeded
    if (limit.messageCount >= config.rateLimit.messageRateLimit) {
      logger.warn(
        { socketId, count: limit.messageCount, limit: config.rateLimit.messageRateLimit },
        'Message rate limit exceeded'
      );
      return false;
    }

    limit.messageCount++;
    return true;
  }

  /**
   * Clean up rate limit data for a socket
   */
  removeSocket(socketId: string): void {
    this.messageBuckets.delete(socketId);
    this.connectionRateLimits.delete(socketId);
  }

  /**
   * Clean up old rate limit entries (periodic cleanup)
   */
  cleanup(): void {
    const now = Date.now();
    const windowMs = config.rateLimit.messageRateWindowMs;

    for (const [socketId, limit] of this.connectionRateLimits.entries()) {
      if (now - limit.windowStart > windowMs * 2) {
        // Remove entries older than 2 windows
        this.connectionRateLimits.delete(socketId);
      }
    }
  }
}

export const rateLimiter = new RateLimiter();

// Periodic cleanup every 5 minutes
setInterval(() => {
  rateLimiter.cleanup();
}, 5 * 60 * 1000);
