/**
 * Channel utility functions for parsing and validating channel names
 */

import type { ChannelType } from '../types/index.js';

const CHANNEL_PREFIXES = {
  public: 'public-',
  private: 'private-',
  presence: 'presence-',
} as const;

/**
 * Determine channel type from name
 */
export function getChannelType(channelName: string): ChannelType {
  if (channelName.startsWith(CHANNEL_PREFIXES.presence)) {
    return 'presence';
  }
  if (channelName.startsWith(CHANNEL_PREFIXES.private)) {
    return 'private';
  }
  return 'public';
}

/**
 * Validate channel name format
 */
export function isValidChannelName(channelName: string): boolean {
  if (!channelName || channelName.length > 200) {
    return false;
  }
  
  // Channel names should match pattern: type-name
  // e.g., public-chat, private-user-123, presence-room-abc
  const validPattern = /^(public|private|presence)-[a-zA-Z0-9_-]+$/;
  return validPattern.test(channelName);
}

/**
 * Check if channel requires authentication
 */
export function requiresAuth(channelName: string): boolean {
  const type = getChannelType(channelName);
  return type === 'private' || type === 'presence';
}
