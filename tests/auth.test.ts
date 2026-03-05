/**
 * Authentication tests
 */

import { generateAuth, verifyAuth, createAuthResponse } from '../src/utils/auth.js';

// Set test secret
process.env.AUTH_SECRET = 'test-secret-key';

describe('Authentication', () => {
  describe('generateAuth', () => {
    test('should generate auth string in correct format', () => {
      const auth = generateAuth('socket-123', 'private-user-456');
      expect(auth).toContain(':');
      const [socketId, signature] = auth.split(':');
      expect(socketId).toBe('socket-123');
      expect(signature).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex
    });

    test('should generate different signatures for different channels', () => {
      const auth1 = generateAuth('socket-123', 'private-user-456');
      const auth2 = generateAuth('socket-123', 'private-user-789');
      expect(auth1).not.toBe(auth2);
    });

    test('should generate different signatures for different sockets', () => {
      const auth1 = generateAuth('socket-123', 'private-user-456');
      const auth2 = generateAuth('socket-456', 'private-user-456');
      expect(auth1).not.toBe(auth2);
    });
  });

  describe('verifyAuth', () => {
    test('should verify valid auth token', () => {
      const auth = generateAuth('socket-123', 'private-user-456');
      expect(verifyAuth(auth, 'socket-123', 'private-user-456')).toBe(true);
    });

    test('should reject invalid signature', () => {
      const auth = generateAuth('socket-123', 'private-user-456');
      const invalidAuth = auth.replace(/[a-f0-9]$/, 'x');
      expect(verifyAuth(invalidAuth, 'socket-123', 'private-user-456')).toBe(false);
    });

    test('should reject auth with wrong socket ID', () => {
      const auth = generateAuth('socket-123', 'private-user-456');
      expect(verifyAuth(auth, 'socket-999', 'private-user-456')).toBe(false);
    });

    test('should reject auth with wrong channel', () => {
      const auth = generateAuth('socket-123', 'private-user-456');
      expect(verifyAuth(auth, 'socket-123', 'private-user-999')).toBe(false);
    });
  });

  describe('createAuthResponse', () => {
    test('should create auth response for private channel', () => {
      const request = {
        socket_id: 'socket-123',
        channel_name: 'private-user-456',
      };
      const response = createAuthResponse(request);
      expect(response.auth).toBeDefined();
      expect(response.auth).toContain(':');
    });

    test('should include channel_data for presence channels', () => {
      const request = {
        socket_id: 'socket-123',
        channel_name: 'presence-room-abc',
        channel_data: JSON.stringify({ user_id: 'user-123' }),
      };
      const response = createAuthResponse(request);
      expect(response.auth).toBeDefined();
      expect(response.channel_data).toBe(request.channel_data);
    });
  });
});
