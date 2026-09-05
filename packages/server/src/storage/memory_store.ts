import { EncryptedVaultEnvelope, ProbeDefinition } from './types.js';

export interface StorageAdapter {
  getVault(vaultId: string): Promise<EncryptedVaultEnvelope | null>;
  saveVault(envelope: EncryptedVaultEnvelope): Promise<void>;
  listVaults(): Promise<string[]>;
  deleteVault(vaultId: string): Promise<boolean>;
  saveProbe(probe: ProbeDefinition): Promise<void>;
  getProbe(probeId: string): Promise<ProbeDefinition | null>;
  listProbes(): Promise<ProbeDefinition[]>;
  deleteProbe(probeId: string): Promise<boolean>;
}

export class MemoryStorageAdapter implements StorageAdapter {
  private vaults: Map<string, EncryptedVaultEnvelope> = new Map();
  private probes: Map<string, ProbeDefinition> = new Map();

  async getVault(vaultId: string): Promise<EncryptedVaultEnvelope | null> {
    const envelope = this.vaults.get(vaultId);
    if (!envelope) return null;
    return {
      ...envelope,
      vectorClock: envelope.vectorClock ? { ...envelope.vectorClock } : {}
    };
  }

  async saveVault(envelope: EncryptedVaultEnvelope): Promise<void> {
    this.vaults.set(envelope.vaultId, {
      ...envelope,
      vectorClock: envelope.vectorClock ? { ...envelope.vectorClock } : {}
    });
  }

  async listVaults(): Promise<string[]> {
    return Array.from(this.vaults.keys());
  }

  async deleteVault(vaultId: string): Promise<boolean> {
    return this.vaults.delete(vaultId);
  }

  async saveProbe(probe: ProbeDefinition): Promise<void> {
    this.probes.set(probe.probeId, {
      ...probe,
      request: { ...probe.request, headers: probe.request.headers ? { ...probe.request.headers } : undefined },
      assertion: {
        ...probe.assertion,
        mustContain: probe.assertion.mustContain ? [...probe.assertion.mustContain] : undefined,
        denyKeywords: probe.assertion.denyKeywords ? [...probe.assertion.denyKeywords] : undefined
      }
    });
  }

  async getProbe(probeId: string): Promise<ProbeDefinition | null> {
    const probe = this.probes.get(probeId);
    if (!probe) return null;
    return {
      ...probe,
      request: { ...probe.request, headers: probe.request.headers ? { ...probe.request.headers } : undefined },
      assertion: {
        ...probe.assertion,
        mustContain: probe.assertion.mustContain ? [...probe.assertion.mustContain] : undefined,
        denyKeywords: probe.assertion.denyKeywords ? [...probe.assertion.denyKeywords] : undefined
      }
    };
  }

  async listProbes(): Promise<ProbeDefinition[]> {
    return Array.from(this.probes.values()).map(p => ({
      ...p,
      request: { ...p.request, headers: p.request.headers ? { ...p.request.headers } : undefined },
      assertion: {
        ...p.assertion,
        mustContain: p.assertion.mustContain ? [...p.assertion.mustContain] : undefined,
        denyKeywords: p.assertion.denyKeywords ? [...p.assertion.denyKeywords] : undefined
      }
    }));
  }

  async deleteProbe(probeId: string): Promise<boolean> {
    return this.probes.delete(probeId);
  }
}
