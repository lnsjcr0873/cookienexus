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
}

export class SyncWebSocketServer {
  private wss: WebSocketServer;
  private clients: Set<WSClientContext> = new Set();

  constructor(server: http.Server, private storage: StorageAdapter, private audit: AuditLogger) {
    this.wss = new WebSocketServer({ server, path: '/ws/sync' });
    this.init();
  }

  private init() {
    this.wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
      const ip = req.socket.remoteAddress || 'unknown';
      const ctx: WSClientContext = {
        ws,
        deviceId: 'unknown',
        vaultId: 'default',
        authenticated: true, // For demo/local zero-knowledge hub; can verify auth token
        ip
      };
      this.clients.add(ctx);

      ws.on('message', async (data: Buffer | string) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleMessage(ctx, message);
        } catch (err: any) {
          ws.send(JSON.stringify({ type: 'ERROR', message: err.message }));
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
        ctx.ws.send(JSON.stringify({
          type: 'SERVER_HELLO',
          vaultId: ctx.vaultId,
          envelope: currentEnvelope,
        }));
        break;
      }

      case 'SYNC_PUSH': {
        const envelope: EncryptedVaultEnvelope = message.envelope;
        if (!envelope || !envelope.vaultId) {
          throw new Error('Invalid vault envelope');
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

        ctx.ws.send(JSON.stringify({ type: 'SYNC_ACK', vaultId: envelope.vaultId, timestamp: Date.now() }));
        break;
      }

      case 'PING': {
        ctx.ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
        break;
      }

      default:
        ctx.ws.send(JSON.stringify({ type: 'UNKNOWN_MESSAGE', received: message.type }));
    }
  }

  private broadcast(sender: WSClientContext, message: any) {
    const raw = JSON.stringify(message);
    for (const client of this.clients) {
      if (client !== sender && client.vaultId === sender.vaultId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(raw);
      }
    }
  }

  public notifyProbeAlert(alert: any) {
    const raw = JSON.stringify({ type: 'PROBE_ALERT', alert });
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(raw);
      }
    }
  }
}
