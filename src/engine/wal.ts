import type { WALEntry } from './types';

export class WAL {
  private log: WALEntry[] = [];

  append(operation: 'put' | 'delete', key: string, value: string): WALEntry {
    const entry: WALEntry = {
      operation,
      key,
      value,
      timestamp: Date.now(),
    };
    this.log.push(entry);
    return entry;
  }

  getEntries(): WALEntry[] {
    return [...this.log];
  }

  getRecent(n: number): WALEntry[] {
    return this.log.slice(-n);
  }

  clear(): void {
    this.log = [];
  }

  get size(): number {
    return this.log.length;
  }
}
