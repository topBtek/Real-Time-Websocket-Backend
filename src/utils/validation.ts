/**
 * Input validation using Zod schemas
 */

import { z } from 'zod';
import type { WebSocketMessage, SubscribeMessage, UnsubscribeMessage, ClientEventMessage } from '../types/index.js';

export const webSocketMessageSchema = z.object({
  event: z.string().min(1).max(200),
  data: z.unknown().optional(),
  channel: z.string().optional(),
  auth: z.string().optional(),
  channel_data: z.string().optional(),
});

export const subscribeMessageSchema = z.object({
  event: z.literal('pusher:subscribe'),
  data: z.object({
    channel: z.string().min(1).max(200),
    auth: z.string().optional(),
    channel_data: z.string().optional(),
  }),
});

export const unsubscribeMessageSchema = z.object({
  event: z.literal('pusher:unsubscribe'),
  data: z.object({
    channel: z.string().min(1).max(200),
  }),
});

export const clientEventMessageSchema = z.object({
  event: z.string().min(1).max(200),
  data: z.unknown(),
  channel: z.string().min(1).max(200),
});

export const authRequestSchema = z.object({
  socket_id: z.string().min(1),
  channel_name: z.string().min(1).max(200),
  channel_data: z.string().optional(),
});

export function validateMessage(message: unknown): WebSocketMessage | null {
  try {
    return webSocketMessageSchema.parse(message) as WebSocketMessage;
  } catch {
    return null;
  }
}

export function validateSubscribe(message: WebSocketMessage): SubscribeMessage | null {
  try {
    return subscribeMessageSchema.parse(message) as SubscribeMessage;
  } catch {
    return null;
  }
}

export function validateUnsubscribe(message: WebSocketMessage): UnsubscribeMessage | null {
  try {
    return unsubscribeMessageSchema.parse(message) as UnsubscribeMessage;
  } catch {
    return null;
  }
}

export function validateClientEvent(message: WebSocketMessage): ClientEventMessage | null {
  try {
    return clientEventMessageSchema.parse(message) as ClientEventMessage;
  } catch {
    return null;
  }
}
