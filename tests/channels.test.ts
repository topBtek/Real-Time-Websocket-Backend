/**
 * Channel management tests
 */

import { channelManager } from '../src/channels/channel-manager.js';
import { getChannelType, isValidChannelName, requiresAuth } from '../src/utils/channel-utils.js';

describe('Channel Utils', () => {
  describe('getChannelType', () => {
    test('should identify public channels', () => {
      expect(getChannelType('public-chat')).toBe('public');
      expect(getChannelType('public-room-123')).toBe('public');
    });

    test('should identify private channels', () => {
      expect(getChannelType('private-user-123')).toBe('private');
      expect(getChannelType('private-room-abc')).toBe('private');
    });

    test('should identify presence channels', () => {
      expect(getChannelType('presence-room-abc')).toBe('presence');
      expect(getChannelType('presence-chat')).toBe('presence');
    });
  });

  describe('isValidChannelName', () => {
    test('should accept valid channel names', () => {
      expect(isValidChannelName('public-chat')).toBe(true);
      expect(isValidChannelName('private-user-123')).toBe(true);
      expect(isValidChannelName('presence-room-abc')).toBe(true);
    });

    test('should reject invalid channel names', () => {
      expect(isValidChannelName('invalid-channel')).toBe(false);
      expect(isValidChannelName('chat')).toBe(false);
      expect(isValidChannelName('')).toBe(false);
      expect(isValidChannelName('public-')).toBe(false);
    });
  });

  describe('requiresAuth', () => {
    test('should require auth for private channels', () => {
      expect(requiresAuth('private-user-123')).toBe(true);
    });

    test('should require auth for presence channels', () => {
      expect(requiresAuth('presence-room-abc')).toBe(true);
    });

    test('should not require auth for public channels', () => {
      expect(requiresAuth('public-chat')).toBe(false);
    });
  });
});

describe('Channel Manager', () => {
  beforeEach(() => {
    channelManager.clear();
  });

  describe('subscribe', () => {
    test('should add subscriber to channel', () => {
      channelManager.subscribe('public-chat', 'socket-1');
      const channel = channelManager.getChannel('public-chat');
      expect(channel).toBeDefined();
      expect(channel?.subscribers.has('socket-1')).toBe(true);
    });

    test('should create channel if it does not exist', () => {
      channelManager.subscribe('public-new-channel', 'socket-1');
      const channel = channelManager.getChannel('public-new-channel');
      expect(channel).toBeDefined();
    });

    test('should allow multiple subscribers', () => {
      channelManager.subscribe('public-chat', 'socket-1');
      channelManager.subscribe('public-chat', 'socket-2');
      const subscribers = channelManager.getSubscribers('public-chat');
      expect(subscribers.size).toBe(2);
    });
  });

  describe('unsubscribe', () => {
    test('should remove subscriber from channel', () => {
      channelManager.subscribe('public-chat', 'socket-1');
      channelManager.unsubscribe('public-chat', 'socket-1');
      const channel = channelManager.getChannel('public-chat');
      expect(channel).toBeUndefined();
    });

    test('should remove channel when last subscriber leaves', () => {
      channelManager.subscribe('public-chat', 'socket-1');
      channelManager.unsubscribe('public-chat', 'socket-1');
      const channel = channelManager.getChannel('public-chat');
      expect(channel).toBeUndefined();
    });

    test('should keep channel when other subscribers remain', () => {
      channelManager.subscribe('public-chat', 'socket-1');
      channelManager.subscribe('public-chat', 'socket-2');
      channelManager.unsubscribe('public-chat', 'socket-1');
      const channel = channelManager.getChannel('public-chat');
      expect(channel).toBeDefined();
      expect(channel?.subscribers.has('socket-2')).toBe(true);
    });
  });

  describe('getChannelsForSocket', () => {
    test('should return all channels for a socket', () => {
      channelManager.subscribe('public-chat', 'socket-1');
      channelManager.subscribe('public-room', 'socket-1');
      channelManager.subscribe('public-other', 'socket-2');
      
      const channels = channelManager.getChannelsForSocket('socket-1');
      expect(channels).toHaveLength(2);
      expect(channels).toContain('public-chat');
      expect(channels).toContain('public-room');
    });
  });

  describe('unsubscribeFromAll', () => {
    test('should remove socket from all channels', () => {
      channelManager.subscribe('public-chat', 'socket-1');
      channelManager.subscribe('public-room', 'socket-1');
      channelManager.subscribe('public-other', 'socket-2');
      
      channelManager.unsubscribeFromAll('socket-1');
      
      expect(channelManager.getChannel('public-chat')).toBeUndefined();
      expect(channelManager.getChannel('public-room')).toBeUndefined();
      expect(channelManager.getChannel('public-other')).toBeDefined();
    });
  });
});
