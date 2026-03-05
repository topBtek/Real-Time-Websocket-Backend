/**
 * HTTP server tests
 */

import { createServer } from 'http';
import { httpServer } from '../src/http/http-server.js';
import { wsServer } from '../src/ws/websocket-server.js';

const TEST_PORT = 3002;

describe('HTTP Server', () => {
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    process.env.PORT = String(TEST_PORT);
    process.env.AUTH_SECRET = 'test-secret';
    
    await httpServer.initialize();
    server = httpServer.getServer();
    wsServer.initialize(server);
    
    await new Promise<void>((resolve) => {
      server.listen(TEST_PORT, () => {
        resolve();
      });
    });
  });

  afterAll(async () => {
    await wsServer.shutdown();
    await httpServer.shutdown();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('Health Endpoint', () => {
    test('GET /health should return 200', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/health`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(data.stats).toBeDefined();
    });
  });

  describe('Auth Endpoint', () => {
    test('POST /auth should return auth token', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          socket_id: 'socket-123',
          channel_name: 'private-user-456',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.auth).toBeDefined();
      expect(data.auth).toContain(':');
    });

    test('POST /auth should include channel_data for presence', async () => {
      const channelData = JSON.stringify({ user_id: 'user-123' });
      const response = await fetch(`http://localhost:${TEST_PORT}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          socket_id: 'socket-123',
          channel_name: 'presence-room-abc',
          channel_data: channelData,
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.auth).toBeDefined();
      expect(data.channel_data).toBe(channelData);
    });

    test('POST /auth should reject invalid request', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invalid: 'data',
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });
  });

  describe('Admin Stats Endpoint', () => {
    test('GET /admin/stats should return stats', async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/admin/stats`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.connections).toBeDefined();
      expect(data.channels).toBeDefined();
      expect(data.presenceChannels).toBeDefined();
    });
  });
});
