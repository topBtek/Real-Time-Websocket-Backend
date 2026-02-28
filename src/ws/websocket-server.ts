/**
 * WebSocket server implementation using 'ws' library
 * Handles connections, subscriptions, and message broadcasting
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { URL } from 'url';
import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';
import { channelManager } from '../channels/channel-manager.js';
import { presenceManager } from '../presence/presence-manager.js';
import { rateLimiter } from '../rate-limit/rate-limiter.js';
import { verifyAuth, generateAuth } from '../utils/auth.js';
import {
  validateMessage,
  validateSubscribe,
  validateUnsubscribe,
  validateClientEvent,
} from '../utils/validation.js';
import {
  getChannelType,
  isValidChannelName,
  requiresAuth,
} from '../utils/channel-utils.js';
import type {
  WebSocketMessage,
  Connection,
  PresenceMember,
} from '../types/index.js';

interface ClientConnection {
  socket: WebSocket;
  id: string;
  ip: string;
  channels: Set<string>;
  createdAt: number;
  lastActivity: number;
}

class WebSocketServerManager {
  private wss: WebSocketServer | null = null;
  private connections: Map<string, ClientConnection> = new Map();
  private httpServer: ReturnType<typeof createServer> | null = null;

  /**
   * Generate unique socket ID
   */
  private generateSocketId(): string {
    return `${Date.now()}.${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Get client IP from request
   */
  private getClientIp(req: { headers: Record<string, string | string[] | undefined> }): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || 'unknown';
  }

  /**
   * Send message to WebSocket client
   */
  private sendMessage(socket: WebSocket, message: WebSocketMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(message));
      } catch (error) {
        logger.error({ error }, 'Failed to send message to client');
      }
    }
  }

  /**
   * Send error message to client
   */
  private sendError(socket: WebSocket, error: string, event?: string): void {
    this.sendMessage(socket, {
      event: event || 'pusher:error',
      data: { message: error },
    });
  }

  /**
   * Handle subscription request
   */
  private handleSubscribe(conn: ClientConnection, message: WebSocketMessage): void {
    const subscribeMsg = validateSubscribe(message);
    if (!subscribeMsg) {
      this.sendError(conn.socket, 'Invalid subscribe message format');
      return;
    }

    const { channel: channelName, auth, channel_data } = subscribeMsg.data;

    // Validate channel name
    if (!isValidChannelName(channelName)) {
      this.sendError(conn.socket, `Invalid channel name: ${channelName}`);
      return;
    }

    // Check channel limit
    if (conn.channels.size >= config.rateLimit.channelLimitPerConnection) {
      this.sendError(conn.socket, 'Channel limit exceeded');
      return;
    }

    // Check if already subscribed
    if (conn.channels.has(channelName)) {
      logger.debug({ socketId: conn.id, channelName }, 'Already subscribed to channel');
      this.sendMessage(conn.socket, {
        event: 'pusher_internal:subscription_succeeded',
        data: {},
        channel: channelName,
      });
      return;
    }

    // Authenticate for private/presence channels
    if (requiresAuth(channelName)) {
      if (!auth) {
        this.sendError(conn.socket, 'Authentication required for this channel');
        return;
      }

      if (!verifyAuth(auth, conn.id, channelName)) {
        this.sendError(conn.socket, 'Authentication failed');
        return;
      }
    }

    // Subscribe to channel
    channelManager.subscribe(channelName, conn.id);
    conn.channels.add(channelName);

    // Handle presence channel
    const channelType = getChannelType(channelName);
    if (channelType === 'presence') {
      try {
        // Parse channel_data for presence member info
        let member: PresenceMember;
        if (channel_data) {
          const parsed = JSON.parse(channel_data);
          member = {
            user_id: parsed.user_id || conn.id,
            user_info: parsed.user_info || {},
          };
        } else {
          member = {
            user_id: conn.id,
            user_info: {},
          };
        }

        // Add to presence
        presenceManager.addMember(channelName, conn.id, member);

        // Get presence data
        const presenceData = presenceManager.getPresenceData(channelName);

        // Send subscription success with presence data
        this.sendMessage(conn.socket, {
          event: 'pusher_internal:subscription_succeeded',
          data: presenceData,
          channel: channelName,
        });

        // Broadcast member added event to other subscribers
        this.broadcastToChannel(channelName, {
          event: 'pusher_internal:member_added',
          data: { user_id: member.user_id, user_info: member.user_info },
          channel: channelName,
        }, conn.id);
      } catch (error) {
        logger.error({ error, channel_data }, 'Failed to parse presence channel_data');
        this.sendError(conn.socket, 'Invalid channel_data for presence channel');
        return;
      }
    } else {
      // Regular subscription success
      this.sendMessage(conn.socket, {
        event: 'pusher_internal:subscription_succeeded',
        data: {},
        channel: channelName,
      });
    }

    logger.info({ socketId: conn.id, channelName, type: channelType }, 'Client subscribed to channel');
  }

  /**
   * Handle unsubscribe request
   */
  private handleUnsubscribe(conn: ClientConnection, message: WebSocketMessage): void {
    const unsubscribeMsg = validateUnsubscribe(message);
    if (!unsubscribeMsg) {
      this.sendError(conn.socket, 'Invalid unsubscribe message format');
      return;
    }

    const { channel: channelName } = unsubscribeMsg.data;

    if (!conn.channels.has(channelName)) {
      logger.debug({ socketId: conn.id, channelName }, 'Not subscribed to channel');
      return;
    }

    // Unsubscribe
    channelManager.unsubscribe(channelName, conn.id);
    conn.channels.delete(channelName);

    // Handle presence channel member removal
    const channelType = getChannelType(channelName);
    if (channelType === 'presence' && presenceManager.hasMember(channelName, conn.id)) {
      // Get member data before removing (we need user_id for broadcast)
      const member = presenceManager.getMember(channelName, conn.id);
      
      if (member) {
        presenceManager.removeMember(channelName, conn.id);
        
        // Broadcast member removed event
        this.broadcastToChannel(channelName, {
          event: 'pusher_internal:member_removed',
          data: { user_id: member.user_id },
          channel: channelName,
        });
      } else {
        // Still remove even if member data not found
        presenceManager.removeMember(channelName, conn.id);
      }
    }

    logger.info({ socketId: conn.id, channelName }, 'Client unsubscribed from channel');
  }

  /**
   * Handle client event (publish message)
   */
  private handleClientEvent(conn: ClientConnection, message: WebSocketMessage): void {
    // Rate limit check
    if (!rateLimiter.canSendMessage(conn.id)) {
      this.sendError(conn.socket, 'Rate limit exceeded');
      return;
    }

    const eventMsg = validateClientEvent(message);
    if (!eventMsg) {
      this.sendError(conn.socket, 'Invalid client event message format');
      return;
    }

    const { channel: channelName, event, data } = eventMsg;

    // Check if subscribed to channel
    if (!conn.channels.has(channelName)) {
      this.sendError(conn.socket, 'Not subscribed to channel');
      return;
    }

    // Don't allow client events on private/presence channels (security)
    const channelType = getChannelType(channelName);
    if (channelType === 'private' || channelType === 'presence') {
      this.sendError(conn.socket, 'Client events not allowed on private/presence channels');
      return;
    }

    // Broadcast to all subscribers
    this.broadcastToChannel(channelName, {
      event,
      data,
      channel: channelName,
    });

    logger.debug({ socketId: conn.id, channelName, event }, 'Client event broadcasted');
  }

  /**
   * Broadcast message to all subscribers of a channel (except sender)
   */
  private broadcastToChannel(
    channelName: string,
    message: WebSocketMessage,
    excludeSocketId?: string
  ): void {
    const subscribers = channelManager.getSubscribers(channelName);
    
    for (const socketId of subscribers) {
      if (socketId === excludeSocketId) {
        continue;
      }

      const conn = this.connections.get(socketId);
      if (conn && conn.socket.readyState === WebSocket.OPEN) {
        this.sendMessage(conn.socket, message);
      }
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(conn: ClientConnection, rawMessage: string): void {
    conn.lastActivity = Date.now();

    let message: WebSocketMessage;
    try {
      message = JSON.parse(rawMessage) as WebSocketMessage;
    } catch (error) {
      logger.debug({ error, rawMessage }, 'Invalid JSON message');
      this.sendError(conn.socket, 'Invalid JSON format');
      return;
    }

    const validated = validateMessage(message);
    if (!validated) {
      this.sendError(conn.socket, 'Invalid message format');
      return;
    }

    // Route message by event type
    switch (message.event) {
      case 'pusher:subscribe':
        this.handleSubscribe(conn, validated);
        break;

      case 'pusher:unsubscribe':
        this.handleUnsubscribe(conn, validated);
        break;

      case 'pusher:ping':
        // Heartbeat response
        this.sendMessage(conn.socket, {
          event: 'pusher:pong',
          data: {},
        });
        break;

      default:
        // Client event (publish)
        this.handleClientEvent(conn, validated);
        break;
    }
  }

  /**
   * Handle connection close
   */
  private handleClose(conn: ClientConnection): void {
    logger.info({ socketId: conn.id, ip: conn.ip }, 'WebSocket connection closed');

    // Unsubscribe from all channels
    for (const channelName of conn.channels) {
      channelManager.unsubscribe(channelName, conn.id);

      // Handle presence channel
      const channelType = getChannelType(channelName);
      if (channelType === 'presence' && presenceManager.hasMember(channelName, conn.id)) {
        const member = presenceManager.getMember(channelName, conn.id);
        
        if (member) {
          presenceManager.removeMember(channelName, conn.id);
          
          // Broadcast member removed
          this.broadcastToChannel(channelName, {
            event: 'pusher_internal:member_removed',
            data: { user_id: member.user_id },
            channel: channelName,
          });
        } else {
          // Still remove even if member data not found
          presenceManager.removeMember(channelName, conn.id);
        }
      }
    }

    // Cleanup
    this.connections.delete(conn.id);
    rateLimiter.removeSocket(conn.id);
    rateLimiter.removeConnection(conn.ip);
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(socket: WebSocket, req: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }): void {
    const ip = this.getClientIp(req);

    // Check connection limit
    if (!rateLimiter.canConnect(ip)) {
      logger.warn({ ip }, 'Connection limit exceeded, rejecting');
      socket.close(1008, 'Connection limit exceeded');
      return;
    }

    const socketId = this.generateSocketId();
    const conn: ClientConnection = {
      socket,
      id: socketId,
      ip,
      channels: new Set(),
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    this.connections.set(socketId, conn);
    rateLimiter.addConnection(ip);

    logger.info({ socketId, ip }, 'New WebSocket connection');

    // Handle messages
    socket.on('message', (data: Buffer) => {
      this.handleMessage(conn, data.toString());
    });

    // Handle close
    socket.on('close', () => {
      this.handleClose(conn);
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error({ error, socketId: conn.id }, 'WebSocket error');
    });
  }

  /**
   * Initialize WebSocket server
   */
  initialize(httpServer: ReturnType<typeof createServer>): void {
    this.httpServer = httpServer;

    this.wss = new WebSocketServer({
      server: httpServer,
      path: config.wsPath,
      verifyClient: (info) => {
        // Origin validation (if configured)
        if (config.allowedOrigins.length > 0 && !config.allowedOrigins.includes('*')) {
          const origin = info.origin;
          if (origin && !config.allowedOrigins.includes(origin)) {
            logger.warn({ origin, allowed: config.allowedOrigins }, 'Origin not allowed');
            return false;
          }
        }
        return true;
      },
    });

    this.wss.on('connection', (socket, req) => {
      this.handleConnection(socket, req);
    });

    logger.info({ path: config.wsPath }, 'WebSocket server initialized');
  }

  /**
   * Broadcast server event to a channel (server-to-client)
   */
  broadcastServerEvent(channelName: string, event: string, data: unknown): void {
    this.broadcastToChannel(channelName, {
      event,
      data,
      channel: channelName,
    });
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    connections: number;
    channels: number;
    presenceChannels: number;
  } {
    return {
      connections: this.connections.size,
      channels: channelManager.getChannelCount(),
      presenceChannels: presenceManager.getActiveChannels().length,
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down WebSocket server...');

    // Close all connections
    for (const conn of this.connections.values()) {
      conn.socket.close(1001, 'Server shutting down');
    }

    // Close WebSocket server
    if (this.wss) {
      return new Promise((resolve) => {
        this.wss!.close(() => {
          logger.info('WebSocket server closed');
          resolve();
        });
      });
    }
  }
}

export const wsServer = new WebSocketServerManager();
