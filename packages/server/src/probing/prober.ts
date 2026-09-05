import http from 'node:http';
import https from 'node:https';
import { ProbeDefinition } from '../storage/types.js';
import { StorageAdapter } from '../storage/memory_store.js';

export type ProbeAlertCallback = (probe: ProbeDefinition, status: 'HEALTHY' | 'EXPIRED' | 'DEGRADED', reason: string) => void;

/**
 * Intelligent Session Prober & Self-Healing Scheduler
 */
export class ProbingEngine {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private alertListeners: ProbeAlertCallback[] = [];

  constructor(private storage: StorageAdapter) {}

  public onAlert(cb: ProbeAlertCallback) {
    this.alertListeners.push(cb);
  }

  public async registerProbe(probe: ProbeDefinition, cookieHeader?: string) {
    await this.storage.saveProbe(probe);
    this.scheduleProbe(probe, cookieHeader);
  }

  public unregisterProbe(probeId: string) {
    const timer = this.intervals.get(probeId);
    if (timer) {
      clearInterval(timer);
      this.intervals.delete(probeId);
    }
  }

  public stopAll() {
    for (const timer of this.intervals.values()) {
      clearInterval(timer);
    }
    this.intervals.clear();
  }

  public async initAllProbes() {
    const probes = await this.storage.listProbes();
    for (const probe of probes) {
      this.scheduleProbe(probe);
    }
  }

  private scheduleProbe(probe: ProbeDefinition, cookieHeader?: string) {
    this.unregisterProbe(probe.probeId);
    
    // Immediate first check
    this.executeCheck(probe.probeId, cookieHeader);

    // Periodic schedule
    const intervalMs = probe.scheduleMs || 60000;
    const timer = setInterval(() => {
      this.executeCheck(probe.probeId, cookieHeader);
    }, intervalMs);

    this.intervals.set(probe.probeId, timer);
  }

  public async executeCheck(probeId: string, cookieHeader?: string): Promise<ProbeDefinition | null> {
    const probe = await this.storage.getProbe(probeId);
    if (!probe) return null;

    const startTime = Date.now();
    try {
      const response = await this.performHttpRequest(probe, cookieHeader);
      const latency = Date.now() - startTime;
      
      const isStatusValid = probe.assertion.expectedStatus 
        ? response.statusCode === probe.assertion.expectedStatus 
        : (response.statusCode >= 200 && response.statusCode < 400);

      let isContentValid = true;
      let failureReason = '';

      if (!isStatusValid) {
        isContentValid = false;
        failureReason = `HTTP status expected ${probe.assertion.expectedStatus || '2xx/3xx'} but got ${response.statusCode}`;
      } else {
        if (probe.assertion.mustContain) {
          for (const token of probe.assertion.mustContain) {
            if (!response.body.includes(token)) {
              isContentValid = false;
              failureReason = `Missing required content token: "${token}"`;
              break;
            }
          }
        }
        if (isContentValid && probe.assertion.denyKeywords) {
          for (const token of probe.assertion.denyKeywords) {
            if (response.body.includes(token)) {
              isContentValid = false;
              failureReason = `Response contained denied keyword: "${token}" (Session expired/login redirect)`;
              break;
            }
          }
        }
      }

      const status = isContentValid ? 'HEALTHY' : 'EXPIRED';
      probe.lastCheck = Date.now();
      probe.lastStatus = status;
      probe.lastLatencyMs = latency;
      probe.lastErrorMessage = isContentValid ? undefined : failureReason;

      await this.storage.saveProbe(probe);

      if (!isContentValid) {
        this.triggerAlert(probe, status, failureReason);
        if (probe.healing?.action === 'webhook' && probe.healing.webhookUrl) {
          this.dispatchHealingWebhook(probe.healing.webhookUrl, probe, status, failureReason);
        }
      }

      return probe;
    } catch (err: any) {
      probe.lastCheck = Date.now();
      probe.lastStatus = 'DEGRADED';
      probe.lastLatencyMs = Date.now() - startTime;
      probe.lastErrorMessage = err.message || 'Network check failed';
      await this.storage.saveProbe(probe);
      this.triggerAlert(probe, 'DEGRADED', probe.lastErrorMessage || 'Network check failed');
      if (probe.healing?.action === 'webhook' && probe.healing.webhookUrl) {
        this.dispatchHealingWebhook(probe.healing.webhookUrl, probe, 'DEGRADED', probe.lastErrorMessage || 'Network check failed');
      }
      return probe;
    }
  }

  private performHttpRequest(probe: ProbeDefinition, cookieHeader?: string): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(probe.request.url);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const headers = { ...(probe.request.headers || {}) };
      if (cookieHeader) {
        headers['Cookie'] = cookieHeader;
      }

      let settled = false;
      const req = client.request(parsedUrl, {
        method: probe.request.method || 'GET',
        headers,
        timeout: probe.request.timeoutMs || 5000,
      }, (res) => {
        let data = '';
        const MAX_BODY_BYTES = 100 * 1024; // 100 KB max for probe check
        res.on('data', chunk => {
          if (data.length < MAX_BODY_BYTES) {
            data += chunk.toString().slice(0, MAX_BODY_BYTES - data.length);
          }
        });
        res.on('end', () => {
          if (!settled) {
            settled = true;
            resolve({ statusCode: res.statusCode || 0, body: data });
          }
        });
      });

      req.on('error', (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
      req.on('timeout', () => {
        if (!settled) {
          settled = true;
          req.destroy();
          reject(new Error('Probe request timed out'));
        }
      });
      req.end();
    });
  }

  private dispatchHealingWebhook(webhookUrl: string, probe: ProbeDefinition, status: string, reason: string) {
    try {
      const u = new URL(webhookUrl);
      const isHttps = u.protocol === 'https:';
      const client = isHttps ? https : http;
      const payload = JSON.stringify({
        event: 'SESSION_EXPIRATION_ALERT',
        probeId: probe.probeId,
        domain: probe.domain,
        vaultId: probe.vaultId,
        status,
        reason,
        timestamp: Date.now(),
      });

      const req = client.request(u, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload).toString(),
        },
        timeout: 5000,
      });
      req.on('error', (err) => {
        console.warn(`[ProbingEngine] Healing webhook error for ${probe.domain}:`, err.message);
      });
      req.write(payload);
      req.end();
    } catch (e: any) {
      console.warn(`[ProbingEngine] Invalid healing webhook URL ${webhookUrl}:`, e.message);
    }
  }

  private triggerAlert(probe: ProbeDefinition, status: 'HEALTHY' | 'EXPIRED' | 'DEGRADED', reason: string) {
    for (const listener of this.alertListeners) {
      try {
        listener(probe, status, reason);
      } catch (e) {
        console.error('Error in alert listener', e);
      }
    }
  }
}
