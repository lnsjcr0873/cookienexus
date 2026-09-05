# CookieNexus: CRDT State Synchronization Specification

## 1. Problem Definition: Multi-Device Concurrent Conflicts

Traditional cookie sync tools (such as CookieCloud) use a naive "last write wins on the entire database" approach. If Device A logs into `github.com` and Device B logs into `google.com` simultaneously, one device's sync will overwrite and destroy the other device's newly acquired session.

CookieNexus solves this with an **LWW-Element-Set (Last-Write-Wins-Element-Set)** CRDT implementation scoped at the granularity of **individual Cookie identities** (`domain + name + path`).

---

## 2. CRDT Data Structures & State Model

### 2.1 Identity Hash
For each cookie record:
$$\text{CookieKey} = \text{domain} + "|" + \text{name} + "|" + \text{path}$$

### 2.2 Vector Clock & Monotonic Timestamp
Each mutation contains:
1. `updatedAt`: Physical wall-clock timestamp (milliseconds).
2. `nodeId`: Universally unique identifier of the mutating device.
3. `lamport`: Monotonically increasing Lamport counter per node.
4. `isDeleted`: Tombstone boolean flag.

```typescript
export interface CRDTCookieEntry {
  key: string;               // domain|name|path
  value: CookieRecord;       // Full cookie metadata
  timestamp: number;         // Milliseconds
  nodeId: string;            // Device UUID
  lamport: number;           // Counter
  tombstone: boolean;        // Deleted?
}
```

---

## 3. Merge Algorithm (Deterministic Convergence)

Given two entries $E_1$ and $E_2$ for the same $\text{CookieKey}$:

```
function mergeEntry(E1, E2):
    // 1. Compare Lamport clocks
    if E1.lamport > E2.lamport:
        return E1
    if E2.lamport > E1.lamport:
        return E2
        
    // 2. Tie-break with physical timestamp
    if E1.timestamp > E2.timestamp:
        return E1
    if E2.timestamp > E1.timestamp:
        return E2
        
    // 3. Deterministic lexicographical tie-breaker on Node ID
    if E1.nodeId > E2.nodeId:
        return E1
    else:
        return E2
```

### 3.1 Tombstone Garbage Collection
- Deletions are preserved as tombstones (`tombstone: true`).
- A background pruning process removes tombstones older than `TTL_TOMBSTONE = 30 days` to prevent infinite memory growth while ensuring offline clients catch up.
