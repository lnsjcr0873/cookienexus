import http from 'node:http';
import { URL } from 'node:url';
import { config } from './config.js';
import { MemoryStorageAdapter, StorageAdapter } from './storage/memory_store.js';
import { FileStorageAdapter } from './storage/file_store.js';
import { ProbingEngine } from './probing/prober.js';
import { RBACManager } from './rbac/permissions.js';
import { AuditLogger } from './rbac/audit_logger.js';
import { SyncWebSocketServer } from './ws/sync_socket.js';
import { EncryptedVaultEnvelope, ProbeDefinition } from './storage/types.js';

export class CookieNexusHub {
  public server: http.Server;
  public storage: StorageAdapter;
  public prober: ProbingEngine;
  public rbac: RBACManager;
  public audit: AuditLogger;
  public wsServer!: SyncWebSocketServer;

  constructor(customStorage?: StorageAdapter) {
    this.storage = customStorage || (process.env.STORAGE_TYPE === 'file' ? new FileStorageAdapter(process.env.STORAGE_PATH || './data') : new MemoryStorageAdapter());
    this.prober = new ProbingEngine(this.storage);
    this.rbac = new RBACManager();
    this.audit = new AuditLogger();
    this.server = http.createServer((req, res) => this.handleHttpRequest(req, res));
    this.wsServer = new SyncWebSocketServer(this.server, this.storage, this.audit);

    // Forward probe alerts to active WebSocket clients
    this.prober.onAlert((probe, status, reason) => {
      this.wsServer.notifyProbeAlert({
        probeId: probe.probeId,
        domain: probe.domain,
        status,
        reason,
        timestamp: Date.now()
      });
      this.audit.log({
        action: 'PROBE_HEALTH_CHANGE',
        userId: 'system_prober',
        ip: '127.0.0.1',
        status: status === 'HEALTHY' ? 'SUCCESS' : 'DENIED',
        details: `Domain ${probe.domain} status -> ${status}: ${reason}`,
      });
    });
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(config.port, config.host, () => {
        console.log(`[CookieNexus Hub] Server running at http://${config.host}:${config.port}`);
        console.log(`[CookieNexus Hub] WebSocket sync available at ws://${config.host}:${config.port}/ws/sync`);
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    this.prober.stopAll();
    if (this.wsServer) {
      await this.wsServer.close();
    }
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', config.corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method || 'GET';

    try {
      // 1. Health check & System info
      if (pathname === '/health' || pathname === '/api/v1/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'OK', version: '1.0.0', time: new Date().toISOString() }));
        return;
      }

      // 2. OpenAPI JSON specification
      if (pathname === '/api/v1/openapi.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.getOpenApiSpec(), null, 2));
        return;
      }

      // 3. Vault Sync REST endpoints (Zero-Knowledge)
      if (pathname.startsWith('/api/v1/vault/')) {
        const vaultId = pathname.replace('/api/v1/vault/', '').trim();
        
        if (method === 'GET') {
          const envelope = await this.storage.getVault(vaultId);
          if (!envelope) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Vault not found' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(envelope));
          return;
        }

        if (method === 'POST' || method === 'PUT') {
          const body = await this.readJsonBody<EncryptedVaultEnvelope>(req);
          if (!body || !body.ciphertext) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid envelope body' }));
            return;
          }
          body.vaultId = vaultId;
          body.updatedAt = Date.now();
          await this.storage.saveVault(body);

          // Broadcast real-time update to connected WebSocket clients
          this.wsServer.broadcastVaultUpdate(body);

          this.audit.log({
            action: 'REST_VAULT_UPDATE',
            userId: body.deviceId || 'rest_client',
            vaultId,
            ip: req.socket.remoteAddress || 'unknown',
            status: 'SUCCESS',
            details: `Vault ${vaultId} saved with ciphertext size ${body.ciphertext.length}`,
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, vaultId, updatedAt: body.updatedAt }));
          return;
        }
      }

      // 4. Probing endpoints
      if (pathname === '/api/v1/probes' && method === 'GET') {
        const probes = await this.storage.listProbes();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(probes));
        return;
      }

      if (pathname === '/api/v1/probes' && method === 'POST') {
        const probe = await this.readJsonBody<ProbeDefinition>(req);
        if (!probe || !probe.probeId || !probe.domain || !probe.request?.url) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required probe parameters' }));
          return;
        }
        await this.prober.registerProbe(probe);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, probe }));
        return;
      }

      if (pathname.startsWith('/api/v1/probes/check/') && method === 'POST') {
        const probeId = pathname.replace('/api/v1/probes/check/', '');
        const updated = await this.prober.executeCheck(probeId);
        if (!updated) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Probe not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(updated));
        return;
      }

      // 5. Audit Log endpoint
      if (pathname === '/api/v1/audit/logs' && method === 'GET') {
        const logs = this.audit.getRecentLogs(100);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(logs));
        return;
      }

      // Default 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found', path: pathname }));
    } catch (err: any) {
      const code = err.statusCode || 500;
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: code === 400 ? 'Bad Request' : 'Internal Server Error', message: err.message }));
    }
  }

  private readJsonBody<T>(req: http.IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      let body = '';
      const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10 MB limit
      let exceeded = false;

      req.on('data', chunk => {
        if (exceeded) return;
        body += chunk;
        if (body.length > MAX_PAYLOAD_BYTES) {
          exceeded = true;
          req.destroy();
          const err: any = new Error('Payload Too Large (Max 10MB)');
          err.statusCode = 413;
          reject(err);
        }
      });

      req.on('end', () => {
        if (exceeded) return;
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          const err: any = new Error('Malformed JSON payload');
          err.statusCode = 400;
          reject(err);
        }
      });
      req.on('error', reject);
    });
  }

  private getOpenApiSpec() {
    return {
      openapi: '3.1.0',
      info: {
        title: 'CookieNexus Hub API',
        version: '1.0.0',
        description: 'Zero-Knowledge Cookie & Session Synchronization Central Hub',
      },
      paths: {
        '/api/v1/health': {
          get: { summary: 'System Health Check' },
        },
        '/api/v1/vault/{vaultId}': {
          get: { summary: 'Get Encrypted Vault Envelope' },
          post: { summary: 'Upsert Encrypted Vault Envelope' },
        },
        '/api/v1/probes': {
          get: { summary: 'List all registered session probes' },
          post: { summary: 'Register or update a session health probe' },
        },
        '/api/v1/probes/check/{probeId}': {
          post: { summary: 'Trigger an immediate session probe check' },
        },
        '/api/v1/audit/logs': {
          get: { summary: 'Fetch sanitized audit trail' },
        },
      },
    };
  }
}

// Standalone execution entrypoint
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  const hub = new CookieNexusHub();
  hub.start();
}
