# OpenCode Mobile - Complete Architecture Specification

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Components](#architecture-components)
3. [Data Flow & Communication](#data-flow--communication)
4. [Authentication & Security](#authentication--security)
5. [Convex Schema Specification](#convex-schema-specification)
6. [Host Companion App](#host-companion-app)
7. [Client Web Application](#client-web-application)
8. [API Specifications](#api-specifications)
9. [Error Handling](#error-handling)
10. [Edge Cases & Race Conditions](#edge-cases--race-conditions)
11. [Deployment & Configuration](#deployment--configuration)

---

## 1. System Overview

### 1.1 Purpose
This system enables a web-based chat interface to interact with local OpenCode AI instances through a centralized coordination layer (Convex). The key innovation is allowing remote or local clients to use OpenCode servers running on different machines without direct network connectivity between them.

### 1.2 Three-Tier Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  React Native Web App                                   │   │
│  │  - User interface                                       │   │
│  │  - Directory browser                                    │   │
│  │  - Chat interface                                       │   │
│  │  - JWT stored in AsyncStorage                           │   │
│  └────────────────────┬────────────────────────────────────┘   │
└───────────────────────┼─────────────────────────────────────────┘
                        │ HTTPS/WebSocket
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                     COORDINATION LAYER                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Convex Backend                                         │   │
│  │  - Real-time subscriptions                              │   │
│  │  - Request/response message bus                         │   │
│  │  - Host registry & heartbeat tracking                   │   │
│  │  - Session management                                   │   │
│  └────────────────────┬────────────────────────────────────┘   │
└───────────────────────┼─────────────────────────────────────────┘
                        │ HTTPS/WebSocket
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                         HOST LAYER                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Host Companion (Node.js CLI)                           │   │
│  │  - Request processor                                    │   │
│  │  - Opencode serve process manager                       │   │
│  │  - Filesystem scanner                                   │   │
│  │  - Message relay                                        │   │
│  └────────────────────┬────────────────────────────────────┘   │
│                       │                                         │
│  ┌────────────────────┴────────────────────────────────────┐   │
│  │  Multiple Opencode Serve Instances                      │   │
│  │  - One per directory                                    │   │
│  │  - Auto-assigned ports                                  │   │
│  │  - Auto-kill after inactivity                           │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Key Design Decisions

1. **Convex as Message Bus**: All communication flows through Convex, enabling:
   - No direct network requirements between Client and Host
   - Real-time synchronization via subscriptions
   - Persistent request/response tracking
   - Offline capability for Clients (reconnect and see missed messages)

2. **Static Host IDs**: Each Host companion generates a unique, persistent identifier stored locally, allowing:
   - Client to target specific Hosts
   - Host recognition across restarts
   - Multiple Hosts per Convex deployment

3. **Directory-Level Isolation**: Each opencode serve instance is tied to one directory:
   - Prevents conflicts between Clients
   - Clear resource ownership model
   - Simplified process management

4. **JWT-Based Session Security**: Post-authentication, JWTs provide:
   - Stateless authentication (Host doesn't query Convex for every request)
   - 30-day expiration (balances security and convenience)
   - Revocation capability (Host can invalidate on opencode serve shutdown)

---

## 2. Architecture Components

### 2.1 Client (React Native Web App)

**Technology Stack:**
- React Native with react-native-web
- Expo for development and bundling
- Convex React client for real-time subscriptions
- AsyncStorage for JWT persistence

**Responsibilities:**
1. Render user interface for chat and directory browsing
2. Manage authentication flow (hostId + session code + OTP)
3. Subscribe to Convex for real-time updates
4. Send requests to Host via Convex mutations
5. Display opencode serve responses
6. Handle offline/reconnection scenarios

**State Management:**
- **Local State**: Input fields, UI state (loading, error)
- **AsyncStorage**: JWT token, cached hostId preference
- **Convex State**: Messages, directory listings, Host status
- **Context**: Current session, authentication status

**Pages/Screens:**
1. **Host Selection**: Enter hostId (copied from Host terminal)
2. **Authentication**: Enter session code and OTP
3. **Directory Browser**: Navigate Host filesystem
4. **Chat Interface**: Send/receive messages

### 2.2 Convex Backend (Coordination Layer)

**Technology Stack:**
- Convex serverless backend
- Real-time subscriptions via WebSocket
- Automatic schema migrations

**Responsibilities:**
1. Store and synchronize state across all clients
2. Route requests from Clients to correct Hosts
3. Maintain Host registry and health status
4. Enforce authentication via OTP validation
5. Persist chat history and session data
6. Handle rate limiting and quotas

**Tables:**
1. `sessions` (existing): User sessions with OTP
2. `messages` (existing): Chat messages
3. `requests` (new): Request/response message bus
4. `hosts` (new): Host registry and status

### 2.3 Host Companion (Node.js CLI)

**Technology Stack:**
- Node.js with TypeScript
- Bun runtime for execution
- Convex client for subscriptions
- Child process management for opencode serve

**Responsibilities:**
1. Generate and persist static hostId
2. Subscribe to Convex for requests targeting this Host
3. Validate OTP and generate JWT tokens
4. Scan filesystem and return directory listings
5. Spawn and manage opencode serve processes
6. Relay messages between Client and opencode serve
7. Monitor process health and implement auto-kill
8. Maintain heartbeat to signal availability

**Configuration Files:**
- `~/.config/opencode-host/config.json`: hostId, Convex credentials
- `~/.config/opencode-host/active-processes.json`: Tracked opencode serve instances

**Process Model:**
- Single main process (Host Companion)
- Child processes (opencode serve instances)
- No forking/threading within main process (event-loop based)

---

## 3. Data Flow & Communication

### 3.1 Connection Establishment Flow

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client │     │  Convex  │     │   Host   │     │ Opencode │
└────┬────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │               │                │                │
     │ 1. User copies hostId          │                │
     │    from Host terminal          │                │
     │               │                │                │
     │ 2. Enters hostId in Client     │                │
     │               │                │                │
     │ 3. Creates session (gets OTP)  │                │
     │ ───────────────────────────────>                │
     │               │                │                │
     │ 4. Session created, OTP returned               │
     │ <───────────────────────────────                │
     │               │                │                │
     │ 5. Writes authentication request               │
     │    to requests table            │                │
     │ ───────────────────────────────>                │
     │               │                │                │
     │               │ 6. Subscription  │                │
     │               │    notifies Host │                │
     │               │ ────────────────>                │
     │               │                │                │
     │               │                │ 7. Validates OTP
     │               │                │    against session
     │               │ <───────────────                │
     │               │                │                │
     │               │ 8. OTP valid     │                │
     │               │ ────────────────>                │
     │               │                │                │
     │               │                │ 9. Generates JWT
     │               │                │    updates request
     │               │ <───────────────                │
     │               │                │                │
     │ 10. Sees response via subscription              │
     │ <───────────────────────────────                │
     │               │                │                │
     │ 11. Stores JWT in AsyncStorage   │                │
     │               │                │                │
     │ ✓ Authenticated!               │                │
```

### 3.2 Directory Browsing Flow

```
┌─────────┐     ┌──────────┐     ┌──────────┐
│  Client │     │  Convex  │     │   Host   │
└────┬────┘     └────┬─────┘     └────┬─────┘
     │               │                │
     │ 1. User requests to browse     │
     │    /Documents directory        │
     │               │                │
     │ 2. Writes request to Convex    │
     │    {type: "list_dirs", path:    │
     │     "/Documents", jwt: "xxx"}   │
     │ ───────────────────────────────>                │
     │               │                │
     │               │ 3. Host sees request            │
     │               │ ────────────────>                │
     │               │                │
     │               │                │ 4. Validates JWT
     │               │                │    (checks signature
     │               │                │     and expiration)
     │               │                │
     │               │                │ 5. Scans filesystem
     │               │                │    at /Documents
     │               │                │    (fresh scan, no cache)
     │               │                │
     │               │                │ 6. Updates request with
     │               │                │    directory listing
     │               │ <───────────────                │
     │               │                │
     │ 7. Receives listing via        │
     │    subscription                │
     │ <───────────────────────────────                │
     │               │                │
     │ 8. Renders directory UI        │
     │               │                │
     │ ✓ User sees folders:           │
     │   [openremote, xyz, test]      │
```

### 3.3 Starting Opencode Serve Flow

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client │     │  Convex  │     │   Host   │     │ Opencode │
└────┬────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │               │                │                │
     │ 1. User selects directory      │                │
     │    "/Documents/openremote"     │                │
     │               │                │                │
     │ 2. Writes start_opencode req   │                │
     │ ───────────────────────────────>                │
     │               │                │                │
     │               │ 3. Host receives               │
     │               │ ────────────────>                │
     │               │                │                │
     │               │                │ 4. Checks if dir
     │               │                │    already active
     │               │                │    (in activeProcesses)
     │               │                │
     │               │                │ 5. If active:
     │               │                │    → Return existing port
     │               │                │    (reconnection scenario)
     │               │                │
     │               │                │ 6. If not active:
     │               │                │    → Find available port
     │               │                │    → Spawn opencode serve
     │               │                │    → Add to tracking
     │               │                │
     │               │                │ 7. spawns child process:
     │               │                │    `opencode serve
     │               │                │     --port 4097
     │               │                │     --hostname 127.0.0.1
     │               │                │     /Documents/openremote`
     │               │                │
     │               │                │ 8. Waits for health check
     │               │                │    (polls localhost:4097
     │               │                │     until ready)
     │               │                │
     │               │                │ 9. Updates request with
     │               │                │    port and process info
     │               │ <───────────────                │
     │               │                │                │
     │ 10. Receives port: 4097       │                │
     │ <───────────────────────────────                │
     │               │                │                │
     │ ✓ Ready to chat!              │                │
```

### 3.4 Chat Message Flow (Full Relay)

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Client │     │  Convex  │     │   Host   │     │ Opencode │
└────┬────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │               │                │                │
     │ 1. User types: "Hello AI"      │                │
     │               │                │                │
     │ 2. Displays optimistically     │                │
     │    (blue bubble, right side)   │                │
     │               │                │                │
     │ 3. Writes relay_message        │                │
     │    {jwt, message, directory}   │                │
     │ ───────────────────────────────>                │
     │               │                │                │
     │               │ 4. Host receives│                │
     │               │ ────────────────>                │
     │               │                │                │
     │               │                │ 5. Validates JWT
     │               │                │    checks directory
     │               │                │    permission
     │               │                │
     │               │                │ 6. Sends HTTP POST
     │               │                │    to localhost:4097
     │               │                │    (opencode serve API)
     │               │                │
     │               │                │ 7. opencode processes
     │               │                │    and generates response
     │               │                │
     │               │                │ 8. Host receives response
     │               │                │    from opencode serve
     │               │                │
     │               │                │ 9. Writes response to
     │               │                │    Convex messages table
     │               │                │    (or back to request)
     │               │ <───────────────                │
     │               │                │                │
     │ 10. Receives AI response       │                │
     │ <───────────────────────────────                │
     │               │                │                │
     │ 11. Displays response          │                │
     │     (grey bubble, left side)   │                │
     │               │                │                │
     │ 12. Resets inactivity timer    │                │
     │     for this opencode instance │                │
     │               │                │                │
     │ ✓ Complete exchange!           │                │
```

### 3.5 Auto-Kill Inactivity Flow

```
Every 60 seconds, Host Companion checks all active opencode instances:

┌──────────┐
│   Host   │
└────┬─────┘
     │
     │ 1. Check opencode instance at port 4097
     │    Last activity: 65 seconds ago ❌
     │
     │ 2. Kill child process:
     │    `process.kill(pid, 'SIGTERM')`
     │
     │ 3. Wait 5 seconds for graceful shutdown
     │
     │ 4. If still running: `process.kill(pid, 'SIGKILL')`
     │
     │ 5. Update Convex hosts table:
     │    Remove directory from activeDirectories
     │    Invalidate JWT (add to blacklist or just delete)
     │
     │ 6. Update any pending requests for this dir:
     │    Mark as "failed" with reason: "Host disconnected"
     │
     │ ✓ Resources cleaned up
```

---

## 4. Authentication & Security

### 4.1 Authentication Flow

**Phase 1: Initial Connection**
1. Client generates or retrieves hostId from user input
2. Client creates Convex session (code + OTP)
3. Client sends authentication request to specific Host
4. Host validates OTP against Convex session
5. Host generates JWT signed with host secret
6. Client stores JWT for subsequent requests

**Phase 2: Authenticated Requests**
1. Client includes JWT in all requests to Host
2. Host validates JWT signature and expiration
3. Host checks if directory claimed in JWT matches request
4. Process request or reject with 403

### 4.2 JWT Specification

**Header:**
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**Payload:**
```json
{
  "sub": "host-authentication",
  "hostId": "host-abc-123",
  "sessionCode": "ABC123",
  "directories": ["/Documents/openremote"],
  "iat": 1704067200,
  "exp": 1706659200
}
```

**Claims:**
- `sub`: Subject, always "host-authentication"
- `hostId`: The Host's unique identifier
- `sessionCode`: Convex session code for this connection
- `directories`: Array of directories this JWT can access
- `iat`: Issued at (Unix timestamp)
- `exp`: Expiration (30 days from iat)

**Secret:**
- Host generates random 256-bit secret on first run
- Stored in `~/.config/opencode-host/secret.key`
- Used to sign/verify JWTs

### 4.3 Security Considerations

**OTP Security:**
- OTP is single-use for authentication
- Must be transmitted securely (Convex uses HTTPS)
- Host validates OTP against Convex before issuing JWT
- Failed OTP attempts: No rate limiting (Convex handles this)

**JWT Security:**
- JWTs are long-lived (30 days) for convenience
- Host maintains revocation list for early termination
- Each JWT scoped to specific directories
- Directory scope prevents accessing other projects

**Network Security:**
- All traffic between Client-Host goes through Convex (HTTPS/WSS)
- Opencode serve only binds to localhost (127.0.0.1)
- No direct Client-to-opencode network connection
- Host validates JWT before forwarding any request

**Data Privacy:**
- Chat messages pass through Convex (encrypted at rest)
- Host can see all message content (necessary for relay)
- Consider adding E2E encryption if sensitive

---

## 5. Convex Schema Specification

### 5.1 Existing Tables

#### sessions
```typescript
defineTable({
  code: v.string(),           // 6-char unique code
  password: v.string(),       // 10-char OTP
  createdAt: v.number(),      // Unix timestamp
  expiresAt: v.number(),      // 4 hours from creation
  hostId: v.optional(v.string()),  // Associated Host (new field)
})
.index("by_code", ["code"])
```

#### messages
```typescript
defineTable({
  sessionId: v.id("sessions"),
  sender: v.string(),         // "You", "OpenCode", "System"
  text: v.string(),
  timestamp: v.number(),
})
.index("by_session_timestamp", ["sessionId", "timestamp"])
```

### 5.2 New Tables

#### requests
Central message bus for Client-Host communication.

```typescript
defineTable({
  // Targeting
  hostId: v.string(),         // Which Host should process this
  sessionId: v.id("sessions"), // Associated session
  
  // Request details
  type: v.union(
    v.literal("authenticate"),
    v.literal("list_dirs"),
    v.literal("start_opencode"),
    v.literal("stop_opencode"),
    v.literal("relay_message")
  ),
  payload: v.object({
    // For authenticate:
    otpAttempt: v.optional(v.string()),
    
    // For list_dirs:
    path: v.optional(v.string()),
    
    // For start_opencode:
    directory: v.optional(v.string()),
    
    // For relay_message:
    message: v.optional(v.string()),
    port: v.optional(v.number()),
  }),
  
  // Authentication
  jwt: v.optional(v.string()), // Included after auth
  
  // Status tracking
  status: v.union(
    v.literal("pending"),
    v.literal("processing"),
    v.literal("completed"),
    v.literal("failed")
  ),
  
  // Response data
  response: v.optional(v.object({
    // For authenticate:
    jwtToken: v.optional(v.string()),
    
    // For list_dirs:
    directories: v.optional(v.array(v.string())),
    
    // For start_opencode:
    port: v.optional(v.number()),
    pid: v.optional(v.number()),
    
    // For relay_message:
    aiResponse: v.optional(v.string()),
    
    // For all failed:
    error: v.optional(v.string()),
  })),
  
  // Metadata
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
  clientId: v.string(),       // For Client to identify its own requests
})
.index("by_host_status", ["hostId", "status"])
.index("by_session", ["sessionId"])
.index("by_client", ["clientId"])
```

#### hosts
Registry of active Host companions.

```typescript
defineTable({
  hostId: v.string(),         // Unique Host identifier
  status: v.union(
    v.literal("online"),
    v.literal("offline")
  ),
  
  // Active processes
  activeDirectories: v.array(v.object({
    path: v.string(),
    port: v.number(),
    pid: v.number(),
    startedAt: v.number(),
    lastActivity: v.number(), // For auto-kill
    jwtHash: v.string(),      // Hash of JWT for this directory
  })),
  
  // Capabilities
  version: v.string(),        // Host companion version
  platform: v.string(),       // OS: "darwin", "linux", "win32"
  
  // Heartbeat
  lastSeen: v.number(),       // Unix timestamp
  ipAddress: v.optional(v.string()), // For debugging
  
  // JWT management
  revokedJwts: v.array(v.object({
    jwtHash: v.string(),
    revokedAt: v.number(),
    reason: v.string(),
  })),
})
.index("by_hostId", ["hostId"])
.index("by_status", ["status"])
```

---

## 6. Host Companion App

### 6.1 File Structure

```
scripts/
├── host.ts                    # Main entry point
├── host/
│   ├── config.ts             # Configuration management
│   ├── jwt.ts                # JWT generation/validation
│   ├── process-manager.ts    # Opencode serve lifecycle
│   ├── filesystem.ts         # Directory scanning
│   ├── relay.ts              # Message relay logic
│   └── heartbeat.ts          # Keepalive to Convex
```

### 6.2 Configuration

**Config file:** `~/.config/opencode-host/config.json`

```json
{
  "hostId": "host-550e8400-e29b-41d4-a716-446655440000",
  "convexUrl": "https://intent-chinchilla-833.convex.cloud",
  "jwtSecret": "base64-encoded-256-bit-secret",
  "opencodePath": "opencode",  // Command to run opencode
  "portRange": {
    "min": 4096,
    "max": 8192
  },
  "inactivityTimeoutMs": 60000,
  "heartbeatIntervalMs": 30000
}
```

**Generated on first run if not exists.**

### 6.3 Main Loop

```typescript
async function main() {
  // 1. Load or generate configuration
  const config = await loadConfig();
  
  // 2. Connect to Convex
  const convex = new ConvexClient(config.convexUrl);
  
  // 3. Start heartbeat
  startHeartbeat(convex, config.hostId);
  
  // 4. Subscribe to requests
  const subscription = convex.query(
    api.requests.getPendingForHost,
    { hostId: config.hostId }
  ).subscribe();
  
  // 5. Process requests as they arrive
  subscription.onUpdate((requests) => {
    for (const request of requests) {
      processRequest(request, config, convex);
    }
  });
  
  // 6. Start inactivity checker
  startInactivityChecker(config.inactivityTimeoutMs);
  
  // 7. Keep running
  console.log(`Host ${config.hostId} is running...`);
  await keepAlive();
}
```

### 6.4 Request Processing

```typescript
async function processRequest(
  request: Request,
  config: HostConfig,
  convex: ConvexClient
) {
  // Mark as processing
  await convex.mutation(api.requests.markProcessing, { 
    requestId: request._id 
  });
  
  try {
    switch (request.type) {
      case "authenticate":
        await handleAuthenticate(request, config, convex);
        break;
      case "list_dirs":
        await handleListDirs(request, config, convex);
        break;
      case "start_opencode":
        await handleStartOpencode(request, config, convex);
        break;
      case "relay_message":
        await handleRelayMessage(request, config, convex);
        break;
      default:
        throw new Error(`Unknown request type: ${request.type}`);
    }
  } catch (error) {
    // Mark as failed
    await convex.mutation(api.requests.markFailed, {
      requestId: request._id,
      error: error.message
    });
  }
}
```

### 6.5 Opencode Serve Process Management

**Process Tracking:**
```typescript
interface ActiveProcess {
  path: string;
  port: number;
  pid: number;
  childProcess: ChildProcess;
  startedAt: number;
  lastActivity: number;
  jwtHash: string;
}

const activeProcesses = new Map<string, ActiveProcess>();
```

**Starting a Process:**
```typescript
async function startOpencodeServe(
  directory: string,
  config: HostConfig
): Promise<{ port: number; pid: number }> {
  // 1. Find available port
  const port = await findAvailablePort(
    config.portRange.min,
    config.portRange.max
  );
  
  // 2. Check if directory already active
  if (activeProcesses.has(directory)) {
    const existing = activeProcesses.get(directory)!;
    return { port: existing.port, pid: existing.pid };
  }
  
  // 3. Spawn process
  const child = spawn(config.opencodePath, [
    "serve",
    "--port", port.toString(),
    "--hostname", "127.0.0.1",
    directory
  ], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  
  // 4. Log stdout/stderr
  child.stdout.on("data", (data) => {
    console.log(`[opencode ${port}] ${data}`);
  });
  child.stderr.on("data", (data) => {
    console.error(`[opencode ${port}] ${data}`);
  });
  
  // 5. Wait for health check
  await waitForOpencodeReady(port);
  
  // 6. Track process
  activeProcesses.set(directory, {
    path: directory,
    port,
    pid: child.pid!,
    childProcess: child,
    startedAt: Date.now(),
    lastActivity: Date.now(),
    jwtHash: ""
  });
  
  // 7. Handle process exit
  child.on("exit", (code) => {
    console.log(`Opencode serve on port ${port} exited with code ${code}`);
    activeProcesses.delete(directory);
  });
  
  return { port, pid: child.pid! };
}
```

**Health Check:**
```typescript
async function waitForOpencodeReady(
  port: number,
  timeoutMs = 30000
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/global/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  
  throw new Error(`Opencode serve failed to start on port ${port}`);
}
```

### 6.6 Message Relay

```typescript
async function relayMessageToOpencode(
  port: number,
  message: string,
  sessionId: string
): Promise<string> {
  const response = await fetch(
    `http://127.0.0.1:${port}/session/${sessionId}/message`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parts: [{ type: "text", text: message }]
      })
    }
  );
  
  if (!response.ok) {
    throw new Error(`Opencode serve returned ${response.status}`);
  }
  
  const data = await response.json();
  
  // Extract text response from opencode format
  return data.parts
    ?.filter((p: any) => p.type === "text")
    ?.map((p: any) => p.text)
    ?.join(" ") || "No response";
}
```

### 6.7 Inactivity Checker

```typescript
function startInactivityChecker(timeoutMs: number) {
  setInterval(async () => {
    const now = Date.now();
    
    for (const [directory, process] of activeProcesses.entries()) {
      if (now - process.lastActivity > timeoutMs) {
        console.log(`Killing inactive opencode serve: ${directory}`);
        
        // 1. Try graceful shutdown
        process.childProcess.kill("SIGTERM");
        
        // 2. Wait 5 seconds
        await new Promise(r => setTimeout(r, 5000));
        
        // 3. Force kill if still running
        if (!process.childProcess.killed) {
          process.childProcess.kill("SIGKILL");
        }
        
        // 4. Cleanup
        activeProcesses.delete(directory);
        
        // 5. Update Convex
        await updateHostStatus();
      }
    }
  }, 10000); // Check every 10 seconds
}
```

---

## 7. Client Web Application

### 7.1 New Screens

#### Host Selection Screen
```typescript
function HostSelectionScreen() {
  const [hostId, setHostId] = useState("");
  const [loading, setLoading] = useState(false);
  
  const connect = async () => {
    setLoading(true);
    try {
      // Check if host is online
      const host = await convex.query(api.hosts.getStatus, { hostId });
      if (!host || host.status !== "online") {
        Alert.alert("Host offline", "The specified host is not responding");
        return;
      }
      
      // Navigate to auth screen
      navigation.navigate("Authentication", { hostId });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <View>
      <Text>Enter Host ID:</Text>
      <TextInput
        value={hostId}
        onChangeText={setHostId}
        placeholder="e.g., host-550e8400-e29b-41d4-a716-446655440000"
      />
      <Button title="Connect" onPress={connect} disabled={loading} />
      <Text>Tip: Copy the Host ID from your terminal running 'bun run host'</Text>
    </View>
  );
}
```

#### Directory Browser Screen
```typescript
function DirectoryBrowserScreen({ route }) {
  const { hostId, jwt } = route.params;
  const [currentPath, setCurrentPath] = useState("/");
  const [directories, setDirectories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(generateClientId());
  
  // Subscribe to request responses
  useEffect(() => {
    const subscription = convex.query(
      api.requests.getResponse,
      { clientId: requestId.current }
    ).subscribe();
    
    subscription.onUpdate((response) => {
      if (response?.response?.directories) {
        setDirectories(response.response.directories);
        setLoading(false);
      }
    });
    
    return () => subscription.unsubscribe();
  }, []);
  
  const browse = async (path: string) => {
    setLoading(true);
    setCurrentPath(path);
    
    await convex.mutation(api.requests.create, {
      hostId,
      type: "list_dirs",
      payload: { path },
      jwt,
      clientId: requestId.current
    });
  };
  
  const selectDirectory = async (dir: string) => {
    const fullPath = `${currentPath}/${dir}`;
    
    // Request to start opencode serve
    await convex.mutation(api.requests.create, {
      hostId,
      type: "start_opencode",
      payload: { directory: fullPath },
      jwt,
      clientId: requestId.current
    });
    
    // Wait for response then navigate to chat
    // ...
  };
  
  return (
    <View>
      <Text>Current: {currentPath}</Text>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={directories}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => browse(`${currentPath}/${item}`)}>
              <Text>📁 {item}</Text>
            </TouchableOpacity>
          )}
        />
      )}
      <Button title="Select This Directory" onPress={() => selectDirectory("")} />
    </View>
  );
}
```

### 7.2 Updated Chat Screen

The ChatScreen needs modifications to:
1. Use JWT from AsyncStorage
2. Send relay_message requests instead of direct API calls
3. Subscribe to responses via Convex
4. Show connection status to Host

```typescript
function ChatScreen() {
  // ... existing state ...
  const [jwt, setJwt] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string>("");
  const [opencodePort, setOpencodePort] = useState<number | null>(null);
  const requestId = useRef(generateClientId());
  
  // Load JWT on mount
  useEffect(() => {
    AsyncStorage.getItem("hostJwt").then(setJwt);
    AsyncStorage.getItem("hostId").then(setHostId);
  }, []);
  
  // Subscribe to relay responses
  useEffect(() => {
    if (!jwt) return;
    
    const subscription = convex.query(
      api.requests.getResponse,
      { clientId: requestId.current }
    ).subscribe();
    
    subscription.onUpdate((response) => {
      if (response?.response?.aiResponse) {
        // Add AI message to UI
        const aiMsg: MessageWithParts = {
          info: {
            id: `ai-${Date.now()}`,
            role: "OpenCode",
            createdAt: new Date().toISOString(),
          },
          parts: [{ type: "text", text: response.response.aiResponse }],
        };
        dispatch({ type: "ADD_MESSAGE", payload: aiMsg });
      }
    });
    
    return () => subscription.unsubscribe();
  }, [jwt]);
  
  const handleSend = async () => {
    if (!inputText.trim() || !jwt || !opencodePort) return;
    
    const text = inputText.trim();
    setInputText("");
    
    // Optimistically add user message
    // ... existing code ...
    
    // Send via Convex relay
    await convex.mutation(api.requests.create, {
      hostId,
      type: "relay_message",
      payload: { 
        message: text,
        port: opencodePort
      },
      jwt,
      clientId: requestId.current
    });
  };
  
  // ... rest of component ...
}
```

---

## 8. API Specifications

### 8.1 Convex Mutations

#### `requests.create`
Creates a new request for a Host to process.

**Args:**
```typescript
{
  hostId: string;
  type: "authenticate" | "list_dirs" | "start_opencode" | "relay_message";
  payload: object;
  jwt?: string;
  clientId: string;
  sessionId?: string;
}
```

**Returns:** `Id<"requests">`

#### `requests.markProcessing`
Marks a request as being processed.

**Args:** `{ requestId: Id<"requests"> }`

#### `requests.markCompleted`
Marks a request as completed with response.

**Args:**
```typescript
{
  requestId: Id<"requests">;
  response: object;
}
```

#### `requests.markFailed`
Marks a request as failed.

**Args:**
```typescript
{
  requestId: Id<"requests">;
  error: string;
}
```

#### `hosts.updateStatus`
Updates Host heartbeat and status.

**Args:**
```typescript
{
  hostId: string;
  status: "online" | "offline";
  activeDirectories: ActiveDirectory[];
  version: string;
  platform: string;
}
```

### 8.2 Convex Queries

#### `requests.getPendingForHost`
Gets all pending requests for a specific Host.

**Args:** `{ hostId: string }`

**Returns:** `Request[]`

#### `requests.getResponse`
Gets the response for a specific client request.

**Args:** `{ clientId: string }`

**Returns:** `Request | null`

#### `hosts.getStatus`
Gets the status of a specific Host.

**Args:** `{ hostId: string }`

**Returns:** `Host | null`

#### `hosts.listOnline`
Lists all online Hosts.

**Returns:** `Host[]`

---

## 9. Error Handling

### 9.1 Client-Side Errors

| Error | Cause | Action |
|-------|-------|--------|
| Host offline | Host not sending heartbeats | Show "Host unavailable", retry connection |
| JWT expired | 30 days passed or revoked | Redirect to re-authentication |
| Invalid OTP | Wrong code entered | Show error, allow retry |
| Directory in use | Another client using directory | Show error, suggest different directory |
| Opencode failed | Process crashed | Show error, allow retry start |
| Network error | Convex connection lost | Show offline indicator, queue messages |

### 9.2 Host-Side Errors

| Error | Cause | Action |
|-------|-------|--------|
| Port conflict | Requested port in use | Try next available port |
| Opencode not found | `opencode` command not in PATH | Log error, skip request |
| Permission denied | Can't access directory | Return error to Client |
| JWT invalid | Bad signature or expired | Reject request, log attempt |
| Convex unreachable | Network issues | Retry with backoff, mark offline |

### 9.3 Recovery Strategies

**Client Recovery:**
- Exponential backoff for Host reconnection
- Queue messages when offline, send when reconnected
- Clear AsyncStorage JWT on auth failure

**Host Recovery:**
- Auto-reconnect to Convex with backoff
- Restore active processes from tracking file on restart
- Kill orphaned opencode serve processes on startup

---

## 10. Edge Cases & Race Conditions

### 10.1 Multiple Clients, Same Directory

**Problem:** Client A and Client B both try to use `/project/foo`

**Solution:**
1. Host checks `activeProcesses` Map before starting
2. If directory exists, check JWT hash:
   - Same JWT (same client reconnected): Return existing port
   - Different JWT: Reject with "Directory in use"
3. Update request status to "failed" with reason

### 10.2 Client Disconnects During Chat

**Problem:** Client closes browser during active conversation

**Solution:**
- Messages persist in Convex (can reconnect and see history)
- Opencode serve continues running
- Auto-kill after 60s inactivity cleans up resources
- JWT remains valid (30 days)

### 10.3 Host Crashes

**Problem:** Host companion process crashes or computer restarts

**Solution:**
- Heartbeat stops → Convex marks Host as "offline"
- Client sees offline status
- Host auto-restarts: Reloads config, reconnects to Convex
- Orphaned opencode processes killed on Host startup

### 10.4 Concurrent Directory Browsing

**Problem:** Client sends multiple list_dirs requests rapidly

**Solution:**
- Each request gets unique `clientId`
- Client tracks pending requests
- UI shows loading state per request
- Responses matched by `clientId`

### 10.5 Opencode Serve Hangs

**Problem:** Opencode serve process becomes unresponsive

**Solution:**
- Relay requests have 30-second timeout
- If timeout, kill process and remove from active list
- Return error to Client

---

## 11. Deployment & Configuration

### 11.1 Development Setup

**Host Companion:**
```bash
# Install dependencies
bun install

# Configure (first run auto-generates)
bun run host --init

# Run
bun run host
```

**Client:**
```bash
# Start Expo
bun start

# Press 'w' for web
```

### 11.2 Production Deployment

**Host Companion as Service (macOS/Linux):**
```bash
# Create systemd service file
sudo tee /etc/systemd/system/opencode-host.service > /dev/null <<EOF
[Unit]
Description=OpenCode Host Companion
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/path/to/project
ExecStart=/usr/local/bin/bun run host
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable opencode-host
sudo systemctl start opencode-host
```

**Client:**
- Deploy as static web app (Vercel, Netlify)
- Or build Electron wrapper for desktop

### 11.3 Environment Variables

**Host Companion:**
```bash
CONVX_HOST_ID=               # Override generated ID
CONVEX_URL=                  # Convex deployment URL
OPENCODE_PATH=               # Path to opencode binary
PORT_RANGE_MIN=4096
PORT_RANGE_MAX=8192
INACTIVITY_TIMEOUT_MS=60000
```

**Client:**
```bash
EXPO_PUBLIC_CONVEX_URL=      # Already configured
```

---

## Summary

This architecture enables:
- **Decoupled communication**: Client and Host never connect directly
- **Centralized coordination**: Convex manages all state and routing
- **Flexible deployment**: Host can be local or remote (as long as it can reach Convex)
- **Resource management**: Auto-cleanup of idle opencode processes
- **Multi-tenancy**: Multiple Clients per Host, isolated by directory
- **Security**: JWT-based authentication with directory scoping

**Next Steps:**
1. Implement Convex schema changes
2. Build Host Companion CLI
3. Update Client with new screens and flow
4. Test full integration
5. Add monitoring and logging
6. Optimize performance (reduce Convex round trips)

**Estimated Effort:**
- Convex schema & functions: 2-3 hours
- Host Companion: 6-8 hours
- Client updates: 4-6 hours
- Testing & debugging: 3-4 hours
- **Total: ~15-20 hours**
