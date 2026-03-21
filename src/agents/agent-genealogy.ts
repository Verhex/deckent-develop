// ─── Agent Genealogy ────────────────────────────────────────────────────────
// Tracks parent-child relationships between agents.
// Stored in .deckent/agents/genealogy.json.

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Types ──────────────────────────────────────────────────────────

export interface GenealogyNode {
  agentId: string;
  parentId: string | null;
  createdAt: string;
  reason: string;
}

export interface FamilyTree {
  roots: string[];
  nodes: Record<string, GenealogyNode>;
  edges: Array<{ parent: string; child: string }>;
}

// ─── Constants ──────────────────────────────────────────────────────

const AGENTS_DIR = '.deckent/agents';
const GENEALOGY_FILENAME = 'genealogy.json';

// ─── AgentGenealogy ─────────────────────────────────────────────────

export class AgentGenealogy {
  constructor(private projectRoot: string) {}

  /**
   * Register a new agent with an optional parent.
   */
  registerAgent(agentId: string, parentId: string | null, reason: string): void {
    const nodes = this._loadNodes();

    nodes[agentId] = {
      agentId,
      parentId,
      createdAt: new Date().toISOString(),
      reason,
    };

    this._saveNodes(nodes);
  }

  /**
   * Remove an agent from the genealogy.
   */
  removeAgent(agentId: string): boolean {
    const nodes = this._loadNodes();
    if (!(agentId in nodes)) return false;
    delete nodes[agentId];
    this._saveNodes(nodes);
    return true;
  }

  /**
   * Build the full family tree.
   */
  buildFamilyTree(): FamilyTree {
    const nodes = this._loadNodes();
    const roots: string[] = [];
    const edges: Array<{ parent: string; child: string }> = [];

    for (const [id, node] of Object.entries(nodes)) {
      if (node.parentId === null || !(node.parentId in nodes)) {
        roots.push(id);
      }
      if (node.parentId !== null && node.parentId in nodes) {
        edges.push({ parent: node.parentId, child: id });
      }
    }

    return { roots: roots.sort(), nodes, edges };
  }

  /**
   * Find the common ancestor of two agents. Returns null if none found.
   */
  findCommonAncestor(agentA: string, agentB: string): string | null {
    const nodes = this._loadNodes();

    const ancestorsA = this._getAncestorChain(agentA, nodes);
    const ancestorsB = new Set(this._getAncestorChain(agentB, nodes));

    for (const ancestor of ancestorsA) {
      if (ancestorsB.has(ancestor)) {
        return ancestor;
      }
    }

    return null;
  }

  /**
   * Get all descendants of an agent (children, grandchildren, etc).
   */
  getDescendants(agentId: string): string[] {
    const nodes = this._loadNodes();
    const descendants: string[] = [];
    const queue = [agentId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const [id, node] of Object.entries(nodes)) {
        if (node.parentId === current && !descendants.includes(id)) {
          descendants.push(id);
          queue.push(id);
        }
      }
    }

    return descendants.sort();
  }

  /**
   * Get direct children of an agent.
   */
  getChildren(agentId: string): string[] {
    const nodes = this._loadNodes();
    return Object.entries(nodes)
      .filter(([, node]) => node.parentId === agentId)
      .map(([id]) => id)
      .sort();
  }

  /**
   * Get the parent of an agent. Returns null if root.
   */
  getParent(agentId: string): string | null {
    const nodes = this._loadNodes();
    return nodes[agentId]?.parentId ?? null;
  }

  /**
   * Check if an agent exists in the genealogy.
   */
  hasAgent(agentId: string): boolean {
    const nodes = this._loadNodes();
    return agentId in nodes;
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  _getAncestorChain(agentId: string, nodes: Record<string, GenealogyNode>): string[] {
    const chain: string[] = [agentId];
    let current = agentId;
    const visited = new Set<string>();

    while (current && nodes[current]?.parentId != null && !visited.has(current)) {
      visited.add(current);
      const parentId = nodes[current]!.parentId!;
      current = parentId;
      chain.push(current);
    }

    return chain;
  }

  _loadNodes(): Record<string, GenealogyNode> {
    const filePath = path.join(this.projectRoot, AGENTS_DIR, GENEALOGY_FILENAME);
    if (!fs.existsSync(filePath)) return {};

    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
      return raw as Record<string, GenealogyNode>;
    } catch {
      return {};
    }
  }

  _saveNodes(nodes: Record<string, GenealogyNode>): void {
    const dir = path.join(this.projectRoot, AGENTS_DIR);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, GENEALOGY_FILENAME),
      JSON.stringify(nodes, null, 2) + '\n',
      'utf8',
    );
  }
}
