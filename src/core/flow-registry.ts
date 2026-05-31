import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ScheduledFlow } from './scheduled-flow.js';
import { can, Permission } from './rbac.js';

export class FlowRegistry {
  private flows = new Map<string, ScheduledFlow>();
  private readonly baseDir: string;

  constructor(baseDir = '.deckent/flows') {
    this.baseDir = baseDir;
    this._loadFromDisk();
  }

  addFlow(flow: ScheduledFlow, role?: string): void {
    if (role !== undefined && !can(role, Permission.FLOW_MANAGE, flow.tenantId)) {
      throw new Error(`Role '${role}' lacks flow:manage permission for tenant '${flow.tenantId}'`);
    }
    this.flows.set(flow.id, flow);
    this._persist(flow);
  }

  getFlow(id: string): ScheduledFlow | undefined {
    return this.flows.get(id);
  }

  listFlows(tenantId?: string, role?: string): ScheduledFlow[] {
    if (role !== undefined && tenantId !== undefined && !can(role, Permission.READ, tenantId)) {
      throw new Error(`Role '${role}' lacks read permission for tenant '${tenantId}'`);
    }
    const all = Array.from(this.flows.values());
    return tenantId === undefined ? all : all.filter(f => f.tenantId === tenantId);
  }

  removeFlow(id: string, role?: string): boolean {
    const flow = this.flows.get(id);
    if (!flow) return false;
    if (role !== undefined && !can(role, Permission.FLOW_MANAGE, flow.tenantId)) {
      throw new Error(`Role '${role}' lacks flow:manage permission for tenant '${flow.tenantId}'`);
    }
    this.flows.delete(id);
    const filePath = this._flowPath(flow.tenantId, id);
    if (existsSync(filePath)) rmSync(filePath);
    return true;
  }

  enableFlow(id: string, enabled: boolean, role?: string): boolean {
    const flow = this.flows.get(id);
    if (!flow) return false;
    if (role !== undefined && !can(role, Permission.FLOW_MANAGE, flow.tenantId)) {
      throw new Error(`Role '${role}' lacks flow:manage permission for tenant '${flow.tenantId}'`);
    }
    const updated = { ...flow, enabled };
    this.flows.set(id, updated);
    this._persist(updated);
    return true;
  }

  private _flowPath(tenantId: string, id: string): string {
    return join(this.baseDir, tenantId, `${id}.json`);
  }

  private _persist(flow: ScheduledFlow): void {
    const dir = join(this.baseDir, flow.tenantId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(this._flowPath(flow.tenantId, flow.id), JSON.stringify(flow, null, 2), 'utf8');
  }

  private _loadFromDisk(): void {
    if (!existsSync(this.baseDir)) return;
    for (const tenantDir of readdirSync(this.baseDir, { withFileTypes: true })) {
      if (!tenantDir.isDirectory()) continue;
      const tenantPath = join(this.baseDir, tenantDir.name);
      for (const entry of readdirSync(tenantPath, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        try {
          const raw = readFileSync(join(tenantPath, entry.name), 'utf8');
          const flow = JSON.parse(raw) as ScheduledFlow;
          this.flows.set(flow.id, flow);
        } catch {
          // skip malformed files
        }
      }
    }
  }
}
