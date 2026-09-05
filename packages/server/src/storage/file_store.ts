import fs from 'node:fs';
import path from 'node:path';
import { StorageAdapter } from './memory_store.js';
import { EncryptedVaultEnvelope, ProbeDefinition } from './types.js';

export class FileStorageAdapter implements StorageAdapter {
  private baseDir: string;
  private vaultsFile: string;
  private probesFile: string;

  private vaults: Map<string, EncryptedVaultEnvelope> = new Map();
  private probes: Map<string, ProbeDefinition> = new Map();

  constructor(baseDir: string = './data') {
    this.baseDir = path.resolve(baseDir);
    this.vaultsFile = path.join(this.baseDir, 'vaults.json');
    this.probesFile = path.join(this.baseDir, 'probes.json');

    this.ensureDir();
    this.loadFromDisk();
  }

  private ensureDir() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.vaultsFile)) {
        const data = fs.readFileSync(this.vaultsFile, 'utf-8');
        const parsed = JSON.parse(data);
        for (const [k, v] of Object.entries(parsed)) {
          this.vaults.set(k, v as EncryptedVaultEnvelope);
        }
      }
    } catch (e) {
      console.error('[FileStorageAdapter] Failed to load vaults.json, starting fresh', e);
    }

    try {
      if (fs.existsSync(this.probesFile)) {
        const data = fs.readFileSync(this.probesFile, 'utf-8');
        const parsed = JSON.parse(data);
        for (const [k, v] of Object.entries(parsed)) {
          this.probes.set(k, v as ProbeDefinition);
        }
      }
    } catch (e) {
      console.error('[FileStorageAdapter] Failed to load probes.json, starting fresh', e);
    }
  }

  private persistVaults() {
    const obj: Record<string, EncryptedVaultEnvelope> = {};
    for (const [k, v] of this.vaults.entries()) {
      obj[k] = v;
    }
    const tmpFile = `${this.vaultsFile}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(obj, null, 2), 'utf-8');
    fs.renameSync(tmpFile, this.vaultsFile);
  }

  private persistProbes() {
    const obj: Record<string, ProbeDefinition> = {};
    for (const [k, v] of this.probes.entries()) {
      obj[k] = v;
    }
    const tmpFile = `${this.probesFile}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(obj, null, 2), 'utf-8');
    fs.renameSync(tmpFile, this.probesFile);
  }

  async getVault(vaultId: string): Promise<EncryptedVaultEnvelope | null> {
    return this.vaults.get(vaultId) || null;
  }

  async saveVault(envelope: EncryptedVaultEnvelope): Promise<void> {
    this.vaults.set(envelope.vaultId, envelope);
    this.persistVaults();
  }

  async listVaults(): Promise<string[]> {
    return Array.from(this.vaults.keys());
  }

  async saveProbe(probe: ProbeDefinition): Promise<void> {
    this.probes.set(probe.probeId, probe);
    this.persistProbes();
  }

  async getProbe(probeId: string): Promise<ProbeDefinition | null> {
    return this.probes.get(probeId) || null;
  }

  async listProbes(): Promise<ProbeDefinition[]> {
    return Array.from(this.probes.values());
  }

  async deleteProbe(probeId: string): Promise<boolean> {
    const deleted = this.probes.delete(probeId);
    if (deleted) {
      this.persistProbes();
    }
    return deleted;
  }
}
