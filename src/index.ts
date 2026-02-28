/**
 * Main entry point for the WebSocket messaging backend
 */

import { logger } from './utils/logger.js';
import { httpServer } from './http/http-server.js';
import { wsServer } from './ws/websocket-server.js';

let isShuttingDown = false;

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info({ signal }, 'Received shutdown signal');

  try {
    await wsServer.shutdown();
    await httpServer.shutdown();
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during shutdown');
    process.exit(1);
  }
}

/**
 * Start the server
 */
async function start(): Promise<void> {
  try {
    // Initialize HTTP server
    await httpServer.initialize();

    // Initialize WebSocket server with HTTP server
    wsServer.initialize(httpServer.getServer());

    // Start HTTP server (WebSocket server attaches to it)
    await httpServer.start();

    // Setup graceful shutdown
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error({ error }, 'Uncaught exception');
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.error({ reason }, 'Unhandled rejection');
      shutdown('unhandledRejection');
    });

    logger.info('Server started successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Start the server
start();
