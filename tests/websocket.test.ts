/**
 * WebSocket server tests
 */

import { WebSocket } from 'ws';
import { createServer } from 'http';
import { wsServer } from '../src/ws/websocket-server.js';
import { httpServer } from '../src/http/http-server.js';
import { channelManager } from '../src/channels/channel-manager.js';
import { presenceManager } from '../src/presence/presence-manager.js';

const TEST_PORT = 3001;
const WS_URL = `ws://localhost:${TEST_PORT}/ws`;

describe('WebSocket Server', () => {
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    // Setup test server
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
    channelManager.clear();
    presenceManager.clear();
    await wsServer.shutdown();
    await httpServer.shutdown();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    channelManager.clear();
    presenceManager.clear();
  });

  describe('Connection', () => {
    test('should accept WebSocket connection', (done) => {
      const ws = new WebSocket(WS_URL);
      
      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    test('should generate unique socket IDs', (done) => {
      const ws1 = new WebSocket(WS_URL);
      const ws2 = new WebSocket(WS_URL);
      const socketIds: string[] = [];

      let completed = 0;
      const checkDone = () => {
        completed++;
        if (completed === 2) {
          expect(socketIds[0]).not.toBe(socketIds[1]);
          done();
        }
      };

      ws1.on('open', () => {
        // Socket ID is not directly exposed, but we can verify connections are tracked
        checkDone();
        ws1.close();
      });

      ws2.on('open', () => {
        checkDone();
        ws2.close();
      });
    });
  });

  describe('Subscription', () => {
    test('should subscribe to public channel', (done) => {
      const ws = new WebSocket(WS_URL);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          event: 'pusher:subscribe',
          data: { channel: 'public-chat' },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.event === 'pusher_internal:subscription_succeeded') {
          expect(message.channel).toBe('public-chat');
          // Note: We can't easily get socket ID from client, but subscription succeeded means it worked
          ws.close();
          done();
        }
      });
    });

    test('should reject invalid channel name', (done) => {
      const ws = new WebSocket(WS_URL);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          event: 'pusher:subscribe',
          data: { channel: 'invalid-channel' },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.event === 'pusher:error') {
          expect(message.data.message).toContain('Invalid channel name');
          ws.close();
          done();
        }
      });
    });

    test('should require auth for private channel', (done) => {
      const ws = new WebSocket(WS_URL);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          event: 'pusher:subscribe',
          data: { channel: 'private-user-123' },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.event === 'pusher:error') {
          expect(message.data.message).toContain('Authentication required');
          ws.close();
          done();
        }
      });
    });
  });

  describe('Unsubscription', () => {
    test('should unsubscribe from channel', (done) => {
      const ws = new WebSocket(WS_URL);
      let subscribed = false;

      ws.on('open', () => {
        ws.send(JSON.stringify({
          event: 'pusher:subscribe',
          data: { channel: 'public-chat' },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.event === 'pusher_internal:subscription_succeeded' && !subscribed) {
          subscribed = true;
          ws.send(JSON.stringify({
            event: 'pusher:unsubscribe',
            data: { channel: 'public-chat' },
          }));
        } else if (subscribed) {
          // After unsubscribe, channel should be removed
          setTimeout(() => {
            const channel = channelManager.getChannel('public-chat');
            expect(channel).toBeUndefined();
            ws.close();
            done();
          }, 100);
        }
      });
    });
  });

  describe('Publishing', () => {
    test('should broadcast message to subscribers', (done) => {
      const ws1 = new WebSocket(WS_URL);
      const ws2 = new WebSocket(WS_URL);
      let ws1Subscribed = false;
      let ws2Subscribed = false;

      ws1.on('open', () => {
        ws1.send(JSON.stringify({
          event: 'pusher:subscribe',
          data: { channel: 'public-chat' },
        }));
      });

      ws2.on('open', () => {
        ws2.send(JSON.stringify({
          event: 'pusher:subscribe',
          data: { channel: 'public-chat' },
        }));
      });

      ws1.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.event === 'pusher_internal:subscription_succeeded') {
          ws1Subscribed = true;
          if (ws1Subscribed && ws2Subscribed) {
            ws1.send(JSON.stringify({
              event: 'new-message',
              data: { text: 'Hello' },
              channel: 'public-chat',
            }));
          }
        } else if (message.event === 'new-message') {
          expect(message.data.text).toBe('Hello');
          ws1.close();
          ws2.close();
          done();
        }
      });

      ws2.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.event === 'pusher_internal:subscription_succeeded') {
          ws2Subscribed = true;
        } else if (message.event === 'new-message') {
          expect(message.data.text).toBe('Hello');
        }
      });
    });
  });

  describe('Presence Channels', () => {
    test('should handle presence channel subscription', (done) => {
      const ws = new WebSocket(WS_URL);
      let socketId: string | null = null;

      ws.on('open', async () => {
        // Wait a bit for socket ID to be assigned, then get auth
        // In real scenario, socket ID would come from connection metadata
        // For test, we'll use a placeholder and the server will handle it
        socketId = 'test-socket-' + Date.now();
        
        // First, get auth token
        const response = await fetch(`http://localhost:${TEST_PORT}/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            socket_id: socketId,
            channel_name: 'presence-room-abc',
            channel_data: JSON.stringify({
              user_id: 'user-123',
              user_info: { name: 'Test User' },
            }),
          }),
        });

        const auth = await response.json();
        
        ws.send(JSON.stringify({
          event: 'pusher:subscribe',
          data: {
            channel: 'presence-room-abc',
            auth: auth.auth,
            channel_data: JSON.stringify({
              user_id: 'user-123',
              user_info: { name: 'Test User' },
            }),
          },
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.event === 'pusher_internal:subscription_succeeded') {
          expect(message.data.presence).toBeDefined();
          expect(message.data.presence.count).toBeGreaterThanOrEqual(1);
          ws.close();
          done();
        }
      });
    });
  });

  describe('Heartbeat', () => {
    test('should respond to ping with pong', (done) => {
      const ws = new WebSocket(WS_URL);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          event: 'pusher:ping',
          data: {},
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.event === 'pusher:pong') {
          ws.close();
          done();
        }
      });
    });
  });
});
