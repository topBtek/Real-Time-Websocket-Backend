/**
 * Channel management - tracks channels and their subscribers
 */

import { logger } from '../utils/logger.js';
import type { ChannelInfo, ChannelType } from '../types/index.js';
import { getChannelType } from '../utils/channel-utils.js';

class ChannelManager {
  private channels: Map<string, ChannelInfo> = new Map();

  /**
   * Get or create a channel
   */
  getOrCreateChannel(channelName: string): ChannelInfo {
    let channel = this.channels.get(channelName);
    
    if (!channel) {
      channel = {
        name: channelName,
        type: getChannelType(channelName),
        subscribers: new Set(),
      };
      this.channels.set(channelName, channel);
      logger.debug({ channelName, type: channel.type }, 'Channel created');
    }
    
    return channel;
  }

  /**
   * Get channel info
   */
  getChannel(channelName: string): ChannelInfo | undefined {
    return this.channels.get(channelName);
  }

  /**
   * Add subscriber to channel
   */
  subscribe(channelName: string, socketId: string): void {
    const channel = this.getOrCreateChannel(channelName);
    channel.subscribers.add(socketId);
    logger.debug({ channelName, socketId, subscriberCount: channel.subscribers.size }, 'Subscriber added');
  }

  /**
   * Remove subscriber from channel
   */
  unsubscribe(channelName: string, socketId: string): void {
    const channel = this.channels.get(channelName);
    if (channel) {
      channel.subscribers.delete(socketId);
      
      // Clean up empty channels
      if (channel.subscribers.size === 0) {
        this.channels.delete(channelName);
        logger.debug({ channelName }, 'Channel removed (no subscribers)');
      } else {
        logger.debug({ channelName, socketId, subscriberCount: channel.subscribers.size }, 'Subscriber removed');
      }
    }
  }

  /**
   * Get all subscribers for a channel
   */
  getSubscribers(channelName: string): Set<string> {
    const channel = this.channels.get(channelName);
    return channel ? new Set(channel.subscribers) : new Set();
  }

  /**
   * Check if socket is subscribed to channel
   */
  isSubscribed(channelName: string, socketId: string): boolean {
    const channel = this.channels.get(channelName);
    return channel ? channel.subscribers.has(socketId) : false;
  }

  /**
   * Get all channels a socket is subscribed to
   */
  getChannelsForSocket(socketId: string): string[] {
    const channels: string[] = [];
    for (const [channelName, channel] of this.channels.entries()) {
      if (channel.subscribers.has(socketId)) {
        channels.push(channelName);
      }
    }
    return channels;
  }

  /**
   * Remove socket from all channels
   */
  unsubscribeFromAll(socketId: string): void {
    const channels = this.getChannelsForSocket(socketId);
    channels.forEach((channelName) => {
      this.unsubscribe(channelName, socketId);
    });
  }

  /**
   * Get all active channels
   */
  getAllChannels(): ChannelInfo[] {
    return Array.from(this.channels.values());
  }

  /**
   * Get channel count
   */
  getChannelCount(): number {
    return this.channels.size;
  }

  /**
   * Clear all channels (useful for testing)
   */
  clear(): void {
    this.channels.clear();
  }
}

export const channelManager = new ChannelManager();
