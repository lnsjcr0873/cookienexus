import { WebSocketServer, WebSocket } from 'ws';
import http from 'node:http';
import { StorageAdapter } from '../storage/memory_store.js';
import { AuditLogger } from '../rbac/audit_logger.js';
import { EncryptedVaultEnvelope } from '../storage/types.js';

export interface WSClientContext {
  ws: WebSocket;
  deviceId: string;
  vaultId: string;
  authenticated: boolean;
  ip: string;
  isAlive: boolean;
}

export class SyncWebSocketServer {
  private wss: WebSocketServer;
  private clients: Set<WSClientContext> = new Set();
  private heartbeatTimer: NodeJS.Timeout;

  constructor(server: http.Server, private storage: StorageAdapter, private audit: AuditLogger) {
    this.wss = new WebSocketServer({ server, path: '/ws/sync', maxPayload: 10 * 1024 * 1024 });
    this.init();

    // Periodic heartbeat to clean dead/zombie sockets
    this.heartbeatTimer = setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) {
          try { client.ws.terminate(); } catch (_) {}
          this.clients.delete(client);
        } else {
          client.isAlive = false;
          try { client.ws.ping(); } catch (_) {}
        }
      }
    }, 30000);
  }

  private init() {
    this.wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
      const ip = req.socket.remoteAddress || 'unknown';
      const ctx: WSClientContext = {
        ws,
        deviceId: 'unknown',
        vaultId: 'default',
        authenticated: true, // For demo/local zero-knowledge hub; can verify auth token
        ip,
        isAlive: true,
      };
      this.clients.add(ctx);

      ws.on('pong', () => {
        ctx.isAlive = true;
      });

      ws.on('message', async (data: Buffer | string) => {
        ctx.isAlive = true;
        try {
          const message = JSON.parse(data.toString());
          await this.handleMessage(ctx, message);
        } catch (err: any) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ERROR', message: err.message }));
          }
        }
      });

      ws.on('close', () => {
        this.clients.delete(ctx);
      });
    });
  }

  private async handleMessage(ctx: WSClientContext, message: any) {
    switch (message.type) {
      case 'CLIENT_HELLO': {
        ctx.deviceId = message.deviceId || 'anon_device';
        ctx.vaultId = message.vaultId || 'default';
        
        // Fetch current vault state from storage
        const currentEnvelope = await this.storage.getVault(ctx.vaultId);
        if (ctx.ws.readyState === WebSocket.OPEN) {
          ctx.ws.send(JSON.stringify({
            type: 'SERVER_HELLO',
            vaultId: ctx.vaultId,
            envelope: currentEnvelope,
          }));
        }
        break;
      }

      case 'SYNC_PUSH': {
        const envelope: EncryptedVaultEnvelope = message.envelope;
        if (!envelope || !envelope.vaultId || !envelope.ciphertext) {
          throw new Error('Invalid vault envelope: missing vaultId or ciphertext');
        }

        // Save encrypted envelope into storage (Zero-Knowledge store)
        await this.storage.saveVault(envelope);

        this.audit.log({
          action: 'VAULT_SYNC_PUSH',
          userId: ctx.deviceId,
          vaultId: envelope.vaultId,
          ip: ctx.ip,
          status: 'SUCCESS',
          details: `Encrypted vault synced by device ${ctx.deviceId}, ciphertext len ${envelope.ciphertext.length}`,
        });

        // Broadcast delta to all other connected clients listening to this vault
        this.broadcast(ctx, {
          type: 'SYNC_BROADCAST',
          envelope,
        });

        if (ctx.ws.readyState === WebSocket.OPEN) {
          ctx.ws.send(JSON.stringify({ type: 'SYNC_ACK', vaultId: envelope.vaultId, timestamp: Date.now() }));
        }
        break;
      }

      case 'PING': {
        if (ctx.ws.readyState === WebSocket.OPEN) {
          ctx.ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
        }
        break;
      }

      default:
        if (ctx.ws.readyState === WebSocket.OPEN) {
          ctx.ws.send(JSON.stringify({ type: 'UNKNOWN_MESSAGE', received: message.type }));
        }
    }
  }

  private broadcast(sender: WSClientContext, message: any) {
    const raw = JSON.stringify(message);
    for (const client of this.clients) {
      if (client !== sender && client.vaultId === sender.vaultId && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(raw);
        } catch (e) {}
      }
    }
  }

  public broadcastVaultUpdate(envelope: EncryptedVaultEnvelope) {
    const raw = JSON.stringify({
      type: 'SYNC_BROADCAST',
      envelope,
    });
    for (const client of this.clients) {
      if (client.vaultId === envelope.vaultId && client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(raw);
        } catch (e) {}
      }
    }
  }

  public notifyProbeAlert(alert: any) {
    const raw = JSON.stringify({ type: 'PROBE_ALERT', alert });
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(raw);
        } catch (e) {}
      }
    }
  }

  public close(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    return new Promise((resolve) => {
      for (const client of this.clients) {
        try {
          client.ws.terminate();
        } catch (_) {}
      }
      this.clients.clear();
      this.wss.close(() => resolve());
    });
  }
}
