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
      }

      return probe;
    } catch (err: any) {
      probe.lastCheck = Date.now();
      probe.lastStatus = 'DEGRADED';
      probe.lastLatencyMs = Date.now() - startTime;
      probe.lastErrorMessage = err.message || 'Network check failed';
      await this.storage.saveProbe(probe);
      this.triggerAlert(probe, 'DEGRADED', probe.lastErrorMessage || 'Network check failed');
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

      const req = client.request(parsedUrl, {
        method: probe.request.method || 'GET',
        headers,
        timeout: probe.request.timeoutMs || 5000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode || 0, body: data });
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Probe request timed out'));
      });
      req.end();
    });
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
