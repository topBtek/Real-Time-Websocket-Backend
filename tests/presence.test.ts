/**
 * Presence management tests
 */

import { presenceManager } from '../src/presence/presence-manager.js';

describe('Presence Manager', () => {
  beforeEach(() => {
    presenceManager.clear();
  });

  describe('addMember', () => {
    test('should add member to presence channel', () => {
      presenceManager.addMember('presence-room-abc', 'socket-1', {
        user_id: 'user-123',
        user_info: { name: 'Test User' },
      });

      const members = presenceManager.getMembers('presence-room-abc');
      expect(members).toHaveLength(1);
      expect(members[0].user_id).toBe('user-123');
    });

    test('should allow multiple members in same channel', () => {
      presenceManager.addMember('presence-room-abc', 'socket-1', {
        user_id: 'user-123',
      });
      presenceManager.addMember('presence-room-abc', 'socket-2', {
        user_id: 'user-456',
      });

      const members = presenceManager.getMembers('presence-room-abc');
      expect(members).toHaveLength(2);
    });
  });

  describe('removeMember', () => {
    test('should remove member from presence channel', () => {
      presenceManager.addMember('presence-room-abc', 'socket-1', {
        user_id: 'user-123',
      });
      presenceManager.removeMember('presence-room-abc', 'socket-1');

      const members = presenceManager.getMembers('presence-room-abc');
      expect(members).toHaveLength(0);
    });

    test('should remove channel when last member leaves', () => {
      presenceManager.addMember('presence-room-abc', 'socket-1', {
        user_id: 'user-123',
      });
      presenceManager.removeMember('presence-room-abc', 'socket-1');

      const members = presenceManager.getMembers('presence-room-abc');
      expect(members).toHaveLength(0);
    });
  });

  describe('getPresenceData', () => {
    test('should return presence data in Pusher format', () => {
      presenceManager.addMember('presence-room-abc', 'socket-1', {
        user_id: 'user-123',
        user_info: { name: 'User 1' },
      });
      presenceManager.addMember('presence-room-abc', 'socket-2', {
        user_id: 'user-456',
        user_info: { name: 'User 2' },
      });

      const data = presenceManager.getPresenceData('presence-room-abc');
      expect(data.presence.count).toBe(2);
      expect(data.presence.hash['user-123']).toBeDefined();
      expect(data.presence.hash['user-456']).toBeDefined();
    });

    test('should return empty data for non-existent channel', () => {
      const data = presenceManager.getPresenceData('presence-nonexistent');
      expect(data.presence.count).toBe(0);
      expect(Object.keys(data.presence.hash)).toHaveLength(0);
    });
  });

  describe('getMemberCount', () => {
    test('should return correct member count', () => {
      expect(presenceManager.getMemberCount('presence-room-abc')).toBe(0);
      
      presenceManager.addMember('presence-room-abc', 'socket-1', {
        user_id: 'user-123',
      });
      expect(presenceManager.getMemberCount('presence-room-abc')).toBe(1);
      
      presenceManager.addMember('presence-room-abc', 'socket-2', {
        user_id: 'user-456',
      });
      expect(presenceManager.getMemberCount('presence-room-abc')).toBe(2);
    });
  });

  describe('getActiveChannels', () => {
    test('should return all active presence channels', () => {
      presenceManager.addMember('presence-room-1', 'socket-1', {
        user_id: 'user-1',
      });
      presenceManager.addMember('presence-room-2', 'socket-2', {
        user_id: 'user-2',
      });

      const channels = presenceManager.getActiveChannels();
      expect(channels).toContain('presence-room-1');
      expect(channels).toContain('presence-room-2');
    });

    test('should not return empty channels', () => {
      presenceManager.addMember('presence-room-1', 'socket-1', {
        user_id: 'user-1',
      });
      presenceManager.removeMember('presence-room-1', 'socket-1');

      const channels = presenceManager.getActiveChannels();
      expect(channels).not.toContain('presence-room-1');
    });
  });
});
