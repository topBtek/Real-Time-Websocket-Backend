/**
 * HTTP server for authentication and health endpoints
 */

import fastify, { FastifyInstance } from 'fastify';
import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';
import { createAuthResponse } from '../utils/auth.js';
import { authRequestSchema } from '../utils/validation.js';
import { wsServer } from '../ws/websocket-server.js';
import type { AuthRequest } from '../types/index.js';

class HttpServerManager {
  private server: FastifyInstance | null = null;

  /**
   * Initialize HTTP server
   */
  async initialize(): Promise<void> {
    this.server = fastify({
      logger: false, // We use pino directly
    });

    // Health check endpoint
    this.server.get('/health', async (request, reply) => {
      const stats = wsServer.getStats();
      return reply.code(200).send({
        status: 'ok',
        timestamp: new Date().toISOString(),
        stats,
      });
    });

    // Authentication endpoint (POST /auth)
    this.server.post('/auth', async (request, reply) => {
      try {
        // Validate request body
        const body = request.body as unknown;
        const validated = authRequestSchema.safeParse(body);

        if (!validated.success) {
          logger.debug({ errors: validated.error.errors }, 'Invalid auth request');
          return reply.code(400).send({
            error: 'Invalid request',
            details: validated.error.errors,
          });
        }

        const authRequest: AuthRequest = validated.data;

        // Generate auth response
        const authResponse = createAuthResponse(authRequest);

        logger.debug({ socketId: authRequest.socket_id, channel: authRequest.channel_name }, 'Auth request processed');

        return reply.code(200).send(authResponse);
      } catch (error) {
        logger.error({ error }, 'Error processing auth request');
        return reply.code(500).send({
          error: 'Internal server error',
        });
      }
    });

    // Admin endpoint (optional - basic stats)
    this.server.get('/admin/stats', async (request, reply) => {
      // In production, add authentication here
      const stats = wsServer.getStats();
      return reply.code(200).send({
        ...stats,
        timestamp: new Date().toISOString(),
      });
    });

    // CORS headers (if needed)
    this.server.addHook('onSend', async (request, reply) => {
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type');
    });

    // Handle OPTIONS for CORS
    this.server.options('*', async (request, reply) => {
      return reply.code(204).send();
    });

    logger.info('HTTP server routes registered');
  }

  /**
   * Start HTTP server
   */
  async start(): Promise<void> {
    if (!this.server) {
      throw new Error('Server not initialized');
    }

    try {
      await this.server.listen({ port: config.port, host: '0.0.0.0' });
      logger.info({ port: config.port }, 'HTTP server started');
    } catch (error) {
      logger.error({ error }, 'Failed to start HTTP server');
      throw error;
    }
  }

  /**
   * Get HTTP server instance (for WebSocket server)
   */
  getServer(): ReturnType<typeof fastify>['server'] {
    if (!this.server) {
      throw new Error('Server not initialized');
    }
    return this.server.server;
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.server) {
      logger.info('Shutting down HTTP server...');
      await this.server.close();
      logger.info('HTTP server closed');
    }
  }
}

export const httpServer = new HttpServerManager();
