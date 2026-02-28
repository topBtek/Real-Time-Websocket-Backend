/**
 * Authentication utilities - HMAC signing for Pusher-compatible auth
 */

import crypto from 'crypto';
import { config } from './config.js';
import { logger } from './logger.js';
import type { AuthRequest, AuthResponse } from '../types/index.js';

/**
 * Generate HMAC signature for channel authentication (Pusher-compatible)
 * Format: md5(socket_id:channel_name:secret) or sha256
 */
function generateSignature(socketId: string, channelName: string, secret: string): string {
  const stringToSign = `${socketId}:${channelName}`;
  const signature = crypto.createHmac('sha256', secret).update(stringToSign).digest('hex');
  return signature;
}

/**
 * Generate auth string in Pusher format: "key:signature"
 * For simplicity, we use the socket_id as the "key" part
 */
export function generateAuth(socketId: string, channelName: string): string {
  const signature = generateSignature(socketId, channelName, config.authSecret);
  return `${socketId}:${signature}`;
}

/**
 * Verify authentication token
 */
export function verifyAuth(auth: string, socketId: string, channelName: string): boolean {
  try {
    const [providedSocketId, providedSignature] = auth.split(':');
    
    if (providedSocketId !== socketId) {
      logger.debug({ providedSocketId, socketId }, 'Socket ID mismatch in auth');
      return false;
    }

    const expectedSignature = generateSignature(socketId, channelName, config.authSecret);
    
    // Use constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(providedSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    logger.debug({ error }, 'Auth verification failed');
    return false;
  }
}

/**
 * Generate auth response for HTTP endpoint
 */
export function createAuthResponse(request: AuthRequest): AuthResponse {
  const auth = generateAuth(request.socket_id, request.channel_name);
  
  const response: AuthResponse = { auth };
  
  // For presence channels, include channel_data if provided
  if (request.channel_data) {
    response.channel_data = request.channel_data;
  }
  
  return response;
}
