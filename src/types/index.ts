/**
 * Core type definitions for the WebSocket messaging backend
 */

export interface WebSocketMessage {
  event: string;
  data?: unknown;
  channel?: string;
  auth?: string;
  channel_data?: string;
}

export interface SubscribeMessage {
  event: 'pusher:subscribe';
  data: {
    channel: string;
    auth?: string;
    channel_data?: string;
  };
}

export interface UnsubscribeMessage {
  event: 'pusher:unsubscribe';
  data: {
    channel: string;
  };
}

export interface ClientEventMessage {
  event: string;
  data: unknown;
  channel: string;
}

export type ChannelType = 'public' | 'private' | 'presence';

export interface ChannelInfo {
  name: string;
  type: ChannelType;
  subscribers: Set<string>; // socket IDs
}

export interface PresenceMember {
  user_id: string;
  user_info?: Record<string, unknown>;
}

export interface PresenceData {
  presence: {
    hash: Record<string, PresenceMember>;
    count: number;
  };
}

export interface Connection {
  id: string;
  ip: string;
  channels: Set<string>;
  createdAt: number;
  lastActivity: number;
}

export interface AuthRequest {
  socket_id: string;
  channel_name: string;
  channel_data?: string;
}

export interface AuthResponse {
  auth: string;
  channel_data?: string;
}

export interface RateLimitConfig {
  connectionLimitPerIp: number;
  channelLimitPerConnection: number;
  messageRateLimit: number;
  messageRateWindowMs: number;
}
