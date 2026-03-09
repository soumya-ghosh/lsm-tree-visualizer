import type { KeyValue } from './types';

export class MemTable {
  private data = new Map<string, KeyValue>();

  put(key: string, value: string, timestamp: number, deleted = false): void {
    this.data.set(key, { key, value, timestamp, deleted });
  }

  get(key: string): KeyValue | undefined {
    return this.data.get(key);
  }

  get size(): number {
    return this.data.size;
  }

  getSorted(): KeyValue[] {
    return [...this.data.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  clear(): void {
    this.data.clear();
  }

  entries(): KeyValue[] {
    return [...this.data.values()];
  }
}
