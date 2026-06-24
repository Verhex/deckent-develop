import type { Capability } from './types.js';

export class CapabilityRegistry {
  private readonly caps = new Map<string, Capability>();
  register(cap: Capability): void { this.caps.set(cap.id, cap as Capability); }
  get(id: string): Capability | undefined { return this.caps.get(id); }
  has(id: string): boolean { return this.caps.has(id); }
  list(): Capability[] { return [...this.caps.values()]; }
}
