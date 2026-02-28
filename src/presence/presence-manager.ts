/**
 * Presence management - tracks who is online in presence channels
 * Uses in-memory storage (can be extended with Redis)
 */

import { logger } from '../utils/logger.js';
import type { PresenceMember, PresenceData } from '../types/index.js';

interface PresenceStore {
  [channelName: string]: Map<string, PresenceMember>;
}

class PresenceManager {
  private store: PresenceStore = {};

  /**
   * Add a member to a presence channel
   */
  addMember(channelName: string, socketId: string, member: PresenceMember): void {
    if (!this.store[channelName]) {
      this.store[channelName] = new Map();
    }
    
    this.store[channelName].set(socketId, member);
    logger.debug({ channelName, socketId, member }, 'Member added to presence channel');
  }

  /**
   * Remove a member from a presence channel
   */
  removeMember(channelName: string, socketId: string): void {
    const channel = this.store[channelName];
    if (channel) {
      channel.delete(socketId);
      if (channel.size === 0) {
        delete this.store[channelName];
      }
      logger.debug({ channelName, socketId }, 'Member removed from presence channel');
    }
  }

  /**
   * Get all members in a presence channel
   */
  getMembers(channelName: string): PresenceMember[] {
    const channel = this.store[channelName];
    if (!channel) {
      return [];
    }
    return Array.from(channel.values());
  }

  /**
   * Get presence data in Pusher-compatible format
   */
  getPresenceData(channelName: string): PresenceData {
    const members = this.getMembers(channelName);
    const hash: Record<string, PresenceMember> = {};
    
    // Create hash keyed by user_id (Pusher format)
    members.forEach((member) => {
      hash[member.user_id] = member;
    });

    return {
      presence: {
        hash,
        count: members.length,
      },
    };
  }

  /**
   * Check if a member exists in a channel
   */
  hasMember(channelName: string, socketId: string): boolean {
    const channel = this.store[channelName];
    return channel ? channel.has(socketId) : false;
  }

  /**
   * Get member by socket ID
   */
  getMember(channelName: string, socketId: string): PresenceMember | undefined {
    const channel = this.store[channelName];
    return channel ? channel.get(socketId) : undefined;
  }

  /**
   * Get member count for a channel
   */
  getMemberCount(channelName: string): number {
    const channel = this.store[channelName];
    return channel ? channel.size : 0;
  }

  /**
   * Clear all presence data (useful for testing or cleanup)
   */
  clear(): void {
    this.store = {};
  }

  /**
   * Get all active presence channels
   */
  getActiveChannels(): string[] {
    return Object.keys(this.store);
  }
}

export const presenceManager = new PresenceManager();
