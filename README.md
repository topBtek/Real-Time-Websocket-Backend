# Real-Time WebSocket Messaging Backend – Pusher-style

A production-ready, self-hosted real-time messaging backend built with Node.js and TypeScript, designed to feel like a self-hosted alternative to Pusher or Ably. This backend provides real-time pub/sub messaging, private channels with authentication, presence channels for tracking online users, and robust rate limiting—all while maintaining a familiar Pusher-compatible protocol.

## Overview

This backend enables real-time bidirectional communication between clients and servers using WebSockets. It supports public channels for open communication, private channels that require authentication, and presence channels that track who is online. The implementation follows Pusher's protocol conventions, making it easy for developers familiar with Pusher to adopt, while being fully self-hosted and customizable.

## Features

- **Public Channels**: Open channels for broadcasting messages to all subscribers
- **Private Channels**: Secure channels requiring HMAC-based authentication
- **Presence Channels**: Track online users with join/leave events
- **Pusher-Compatible Protocol**: Familiar API for developers using Pusher clients
- **Client-to-Server Events**: Allow clients to publish messages to channels
- **Server-to-Client Events**: Broadcast messages from server to all subscribers
- **HMAC Authentication**: Secure channel authentication using SHA256 signatures
- **Rate Limiting**: Per-IP connection limits and per-connection message rate limits
- **Connection Management**: Automatic cleanup on disconnect, graceful shutdown
- **Structured Logging**: Production-ready logging with Pino
- **Type Safety**: Full TypeScript support with strict mode
- **Comprehensive Tests**: Jest test suite covering all core functionality
- **Input Validation**: Zod schemas for all incoming messages
- **Health Monitoring**: Health check and admin stats endpoints

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript (ESM modules)
- **WebSocket**: `ws` library (pure WebSocket, no socket.io overhead)
- **HTTP Server**: Fastify (lightweight and fast)
- **Validation**: Zod
- **Logging**: Pino with pino-pretty for development
- **Testing**: Jest with ts-jest
- **Build**: TypeScript compiler

## Prerequisites

- Node.js 20.0.0 or higher
- npm or yarn package manager

## Setup Instructions

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Real-Time-Websocket-Backend-1
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and set at minimum:
   ```env
   AUTH_SECRET=your-secret-key-change-this-in-production
   PORT=3000
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

   The server will start on `http://localhost:3000` with WebSocket endpoint at `ws://localhost:3000/ws`

5. **Build for production**
   ```bash
   npm run build
   npm start
   ```

## Testing Locally

### Using wscat (Command Line)

Install wscat:
```bash
npm install -g wscat
```

Connect and subscribe:
```bash
# Connect to WebSocket
wscat -c ws://localhost:3000/ws

# Subscribe to public channel
{"event":"pusher:subscribe","data":{"channel":"public-chat"}}

# Send a message
{"event":"new-message","data":{"text":"Hello!"},"channel":"public-chat"}
```

### Using Postman WebSocket

1. Create a new WebSocket request to `ws://localhost:3000/ws`
2. Send subscription message:
   ```json
   {
     "event": "pusher:subscribe",
     "data": {
       "channel": "public-chat"
     }
   }
   ```
3. Send a client event:
   ```json
   {
     "event": "new-message",
     "data": {
       "text": "Hello from Postman!"
     },
     "channel": "public-chat"
   }
   ```

### Simple HTML Client Example

Create `test-client.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>WebSocket Test Client</title>
</head>
<body>
  <div id="messages"></div>
  <input type="text" id="messageInput" placeholder="Type a message...">
  <button onclick="sendMessage()">Send</button>

  <script>
    const ws = new WebSocket('ws://localhost:3000/ws');
    const messagesDiv = document.getElementById('messages');
    const messageInput = document.getElementById('messageInput');

    ws.onopen = () => {
      console.log('Connected');
      // Subscribe to public channel
      ws.send(JSON.stringify({
        event: 'pusher:subscribe',
        data: { channel: 'public-chat' }
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('Received:', message);
      
      if (message.event === 'pusher_internal:subscription_succeeded') {
        messagesDiv.innerHTML += '<p>✓ Subscribed to ' + message.channel + '</p>';
      } else if (message.event === 'new-message') {
        messagesDiv.innerHTML += '<p>' + message.data.text + '</p>';
      }
    };

    function sendMessage() {
      const text = messageInput.value;
      if (text) {
        ws.send(JSON.stringify({
          event: 'new-message',
          data: { text },
          channel: 'public-chat'
        }));
        messageInput.value = '';
      }
    }

    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  </script>
</body>
</html>
```

## Protocol Documentation

### Connection Flow

1. Client establishes WebSocket connection to `ws://host:port/ws`
2. Server assigns unique `socket_id` to connection
3. Client can subscribe to channels, send events, or ping for heartbeat

### Subscribe / Auth Flow

#### Public Channel
```json
// Client sends
{
  "event": "pusher:subscribe",
  "data": {
    "channel": "public-chat"
  }
}

// Server responds
{
  "event": "pusher_internal:subscription_succeeded",
  "data": {},
  "channel": "public-chat"
}
```

#### Private Channel
1. **Get auth token** (HTTP POST):
   ```bash
   POST /auth
   Content-Type: application/json
   
   {
     "socket_id": "123.456",
     "channel_name": "private-user-123"
   }
   ```
   
   Response:
   ```json
   {
     "auth": "123.456:hmac-signature"
   }
   ```

2. **Subscribe with auth**:
   ```json
   {
     "event": "pusher:subscribe",
     "data": {
       "channel": "private-user-123",
       "auth": "123.456:hmac-signature"
     }
   }
   ```

#### Presence Channel
1. **Get auth token with channel_data**:
   ```bash
   POST /auth
   {
     "socket_id": "123.456",
     "channel_name": "presence-room-abc",
     "channel_data": "{\"user_id\":\"user-123\",\"user_info\":{\"name\":\"John\"}}"
   }
   ```

2. **Subscribe**:
   ```json
   {
     "event": "pusher:subscribe",
     "data": {
       "channel": "presence-room-abc",
       "auth": "123.456:hmac-signature",
       "channel_data": "{\"user_id\":\"user-123\",\"user_info\":{\"name\":\"John\"}}"
     }
   }
   ```

3. **Server responds with presence data**:
   ```json
   {
     "event": "pusher_internal:subscription_succeeded",
     "data": {
       "presence": {
         "hash": {
           "user-123": {
             "user_id": "user-123",
             "user_info": {"name": "John"}
           }
         },
         "count": 1
       }
     },
     "channel": "presence-room-abc"
   }
   ```

4. **Member join/leave events** (broadcast to other subscribers):
   ```json
   {
     "event": "pusher_internal:member_added",
     "data": {
       "user_id": "user-456",
       "user_info": {"name": "Jane"}
     },
     "channel": "presence-room-abc"
   }
   ```

### Publishing Messages

#### Client-to-Server (Public Channels Only)
```json
{
  "event": "new-message",
  "data": {
    "text": "Hello, world!",
    "timestamp": 1234567890
  },
  "channel": "public-chat"
}
```

All subscribers to `public-chat` will receive:
```json
{
  "event": "new-message",
  "data": {
    "text": "Hello, world!",
    "timestamp": 1234567890
  },
  "channel": "public-chat"
}
```

#### Server-to-Client (Any Channel)
Use the server API to broadcast:
```typescript
wsServer.broadcastServerEvent('public-chat', 'admin-message', {
  text: 'Server maintenance in 5 minutes'
});
```

### Heartbeat

```json
// Client sends
{
  "event": "pusher:ping",
  "data": {}
}

// Server responds
{
  "event": "pusher:pong",
  "data": {}
}
```

### Unsubscribe

```json
{
  "event": "pusher:unsubscribe",
  "data": {
    "channel": "public-chat"
  }
}
```

## Client Usage Example (JavaScript)

```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:3000/ws');
let socketId = null;

ws.onopen = async () => {
  console.log('Connected');
  
  // For private/presence channels, get auth first
  const authResponse = await fetch('http://localhost:3000/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      socket_id: 'your-socket-id', // Get from connection or generate
      channel_name: 'private-user-123'
    })
  });
  
  const { auth } = await authResponse.json();
  
  // Subscribe to private channel
  ws.send(JSON.stringify({
    event: 'pusher:subscribe',
    data: {
      channel: 'private-user-123',
      auth: auth
    }
  }));
  
  // Subscribe to public channel (no auth needed)
  ws.send(JSON.stringify({
    event: 'pusher:subscribe',
    data: {
      channel: 'public-chat'
    }
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.event) {
    case 'pusher_internal:subscription_succeeded':
      console.log('Subscribed to', message.channel);
      break;
      
    case 'new-message':
      console.log('New message:', message.data);
      break;
      
    case 'pusher_internal:member_added':
      console.log('User joined:', message.data.user_id);
      break;
      
    case 'pusher_internal:member_removed':
      console.log('User left:', message.data.user_id);
      break;
  }
};

// Send a message
function sendMessage(text) {
  ws.send(JSON.stringify({
    event: 'new-message',
    data: { text },
    channel: 'public-chat'
  }));
}

// Unsubscribe
function unsubscribe(channel) {
  ws.send(JSON.stringify({
    event: 'pusher:unsubscribe',
    data: { channel }
  }));
}
```

## Security Notes

- **Authentication**: All private and presence channels require HMAC-signed authentication tokens. The signature is generated using SHA256 of `socket_id:channel_name:secret`.
- **Rate Limiting**: 
  - Connection limits per IP address (default: 10)
  - Message rate limits per connection (default: 100 messages per minute)
  - Channel subscription limits per connection (default: 50)
- **Origin Validation**: Configure `ALLOWED_ORIGINS` in `.env` to restrict WebSocket connections by origin
- **Production**: 
  - Always use `wss://` (WebSocket Secure) in production behind a reverse proxy (nginx, Cloudflare, etc.)
  - Set a strong `AUTH_SECRET` (use a cryptographically secure random string)
  - Enable HTTPS/TLS for HTTP endpoints
  - Consider adding IP whitelisting for admin endpoints

## API Endpoints

### `POST /auth`
Authenticate for private/presence channels.

**Request:**
```json
{
  "socket_id": "123.456",
  "channel_name": "private-user-123",
  "channel_data": "{\"user_id\":\"user-123\"}" // Optional, for presence channels
}
```

**Response:**
```json
{
  "auth": "123.456:hmac-signature",
  "channel_data": "{\"user_id\":\"user-123\"}" // If provided in request
}
```

### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "stats": {
    "connections": 10,
    "channels": 5,
    "presenceChannels": 2
  }
}
```

### `GET /admin/stats`
Get server statistics (add authentication in production).

**Response:**
```json
{
  "connections": 10,
  "channels": 5,
  "presenceChannels": 2,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Deployment Hints

### Railway
1. Connect your GitHub repository
2. Set environment variables in Railway dashboard
3. Railway automatically detects Node.js and runs `npm start`
4. WebSocket connections work out of the box

### Fly.io
1. Install Fly CLI: `flyctl install`
2. Create app: `flyctl launch`
3. Set secrets: `flyctl secrets set AUTH_SECRET=your-secret`
4. Deploy: `flyctl deploy`
5. WebSockets are supported by default

### Render
1. Create new Web Service
2. Connect repository
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Set environment variables
6. Enable WebSocket support in Render settings

### Docker
Create `Dockerfile`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

Build and run:
```bash
docker build -t websocket-backend .
docker run -p 3000:3000 -e AUTH_SECRET=your-secret websocket-backend
```

**Important**: Ensure your hosting provider supports WebSocket connections (most modern platforms do).

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm test -- --coverage
```

## Project Structure

```
.
├── src/
│   ├── channels/          # Channel management
│   │   └── channel-manager.ts
│   ├── http/              # HTTP server and routes
│   │   └── http-server.ts
│   ├── presence/          # Presence tracking
│   │   └── presence-manager.ts
│   ├── rate-limit/        # Rate limiting
│   │   └── rate-limiter.ts
│   ├── types/             # TypeScript type definitions
│   │   └── index.ts
│   ├── utils/             # Utilities (auth, config, validation, etc.)
│   │   ├── auth.ts
│   │   ├── channel-utils.ts
│   │   ├── config.ts
│   │   ├── logger.ts
│   │   └── validation.ts
│   ├── ws/                # WebSocket server
│   │   └── websocket-server.ts
│   └── index.ts           # Main entry point
├── tests/                 # Test files
│   ├── auth.test.ts
│   ├── channels.test.ts
│   ├── http.test.ts
│   ├── presence.test.ts
│   └── websocket.test.ts
├── .env.example           # Environment variables template
├── .gitignore
├── jest.config.js         # Jest configuration
├── package.json
├── tsconfig.json          # TypeScript configuration
└── README.md
```

## Contact

- telegram: https://t.me/topBtek
- twitter:  https://x.com/topBtek
