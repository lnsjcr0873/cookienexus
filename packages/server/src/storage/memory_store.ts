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
    return this.vaults.get(vaultId) || null;
  }

  async saveVault(envelope: EncryptedVaultEnvelope): Promise<void> {
    this.vaults.set(envelope.vaultId, envelope);
  }

  async listVaults(): Promise<string[]> {
    return Array.from(this.vaults.keys());
  }

  async deleteVault(vaultId: string): Promise<boolean> {
    return this.vaults.delete(vaultId);
  }

  async saveProbe(probe: ProbeDefinition): Promise<void> {
    this.probes.set(probe.probeId, probe);
  }

  async getProbe(probeId: string): Promise<ProbeDefinition | null> {
    return this.probes.get(probeId) || null;
  }

  async listProbes(): Promise<ProbeDefinition[]> {
    return Array.from(this.probes.values());
  }

  async deleteProbe(probeId: string): Promise<boolean> {
    return this.probes.delete(probeId);
  }
}
