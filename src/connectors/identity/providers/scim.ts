// src/connectors/identity/providers/scim.ts
import { DeckentError } from '../../../core/errors.js';
import type { Role } from '../../../core/rbac.js';
import type { ConnectorId } from '../../types.js';
import type { IdentityStore } from '../identity-store.js';
import type {
  Edition,
  ExternalRef,
  IdentityDirectoryProvider,
  IdentityRecord,
  ResolvedPrincipal,
  SyncReport,
} from '../provider.js';
import { resolvePermissions, type RoleMap } from '../role-map.js';

/**
 * Minimal structural shape of `fetch` the provider depends on — keeps the dependency
 * injectable (tests pass a mock) while the production default is `globalThis.fetch`.
 */
export type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface ScimProviderOptions {
  /** SCIM 2.0 base URL, absolute, no trailing slash (e.g. https://idp.example.com/scim/v2). */
  endpoint: string;
  /** OAuth bearer token for the SCIM endpoint. */
  token: string;
  /** Connector these directory identities bind to (email-keyed, e.g. 'email' | 'slack'). */
  connector: ConnectorId;
  /** Tenant scope for every synced identity. */
  tenantId: string;
  edition?: Edition;                 // default 'enterprise'
  /** Group→role / role→permission map (groupKey path). See resolvePermissions(). */
  roleMap?: RoleMap;
  /** Role assigned when no group matches the role-map. Default 'viewer' (least privilege). */
  defaultRole?: Role;
  /** SCIM `count` page size. Default 100. */
  pageSize?: number;
  /** Injectable fetch — default `globalThis.fetch`. */
  fetch?: FetchLike;
}

interface ScimListResponse {
  totalResults?: number;
  Resources?: ScimResource[];
}

interface ScimResource {
  id?: string;
  userName?: string;
  displayName?: string;
  active?: boolean;
  emails?: Array<{ value?: string; primary?: boolean }>;
  groups?: Array<{ value?: string; display?: string }>;
  members?: Array<{ value?: string; display?: string }>;
}

interface SyncedUser { externalId: string; role: Role }

const ROLE_RANK: Record<Role, number> = { admin: 3, operator: 2, viewer: 1 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Faz-3 enterprise adapter: pulls Users + Group memberships from a SCIM 2.0 IdP into the
 * local IdentityStore. `sync()` is the ONLY network path; `resolve()` is pure-local (hot path).
 *
 * Crash-safety: every page is fetched BEFORE any store mutation — a failed fetch throws and
 * leaves the existing store untouched (no partial/torn sync).
 */
export class ScimIdentityProvider implements IdentityDirectoryProvider {
  readonly id = 'scim';
  readonly edition: Edition;
  private readonly fetchImpl: FetchLike;
  private readonly pageSize: number;
  private readonly defaultRole: Role;

  constructor(private readonly store: IdentityStore, private readonly opts: ScimProviderOptions) {
    this.edition = opts.edition ?? 'enterprise';
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    this.pageSize = opts.pageSize && opts.pageSize > 0 ? opts.pageSize : 100;
    this.defaultRole = opts.defaultRole ?? 'viewer';
  }

  /** HOT PATH — pure-local, fail-closed. NEVER touches the network. */
  resolve(ref: ExternalRef, tenantId: string): ResolvedPrincipal | null {
    const rec = this.store.getIdentity(ref.connector, ref.externalId, tenantId);
    if (!rec) return null; // fail-closed
    return {
      userId: rec.principalId,
      role: rec.role,
      permissions: resolvePermissions(rec.role, this.opts.roleMap),
      tenantId: rec.tenantId,
      verified: rec.verified,
      source: 'scim',
    };
  }

  /**
   * Pull all Users + Group memberships, then reconcile the store: upsert every active
   * directory user and deprovision directory-owned records no longer present.
   */
  async sync(): Promise<SyncReport> {
    // 1) Fetch everything first — any failure throws before a single store write.
    const users = await this.fetchAllPages('/Users');
    const groups = await this.fetchAllPages('/Groups');

    // 2) Build userId → external group names (from /Groups membership ∪ user-embedded groups).
    const groupsByUser = this.indexGroupMembership(groups);

    // 3) Resolve each active user to (externalId=email, role) — pure in-memory, no store write yet.
    const synced: SyncedUser[] = [];
    const activeIds = new Set<string>();
    for (const u of users) {
      if (u.active === false) continue;
      const email = this.emailOf(u);
      if (!email) continue; // can't key without an email — skip honestly (no silent corruption)
      const userGroups = new Set<string>(groupsByUser.get(u.id ?? '') ?? []);
      for (const g of u.groups ?? []) if (g.display) userGroups.add(g.display);
      synced.push({ externalId: email, role: this.roleForGroups(userGroups) });
      activeIds.add(email);
    }

    // 4) Commit: upsert active users, then deprovision stale directory-owned records.
    const now = new Date().toISOString();
    let upserted = 0;
    for (const s of synced) {
      this.store.upsertIdentity({
        connector: this.opts.connector,
        externalId: s.externalId,
        tenantId: this.opts.tenantId,
        principalId: s.externalId,
        role: s.role,
        verified: true,
        method: 'directory',
        updatedAt: now,
      });
      upserted++;
    }

    let removed = 0;
    for (const rec of this.directoryRecords()) {
      if (!activeIds.has(rec.externalId)) {
        this.store.deleteIdentity(rec.connector, rec.externalId, rec.tenantId);
        removed++;
      }
    }

    return { upserted, removed };
  }

  /** Paginate a SCIM list resource via startIndex/count until the directory is exhausted. */
  private async fetchAllPages(path: string): Promise<ScimResource[]> {
    const out: ScimResource[] = [];
    let startIndex = 1;
    for (;;) {
      const url = `${this.opts.endpoint}${path}?startIndex=${startIndex}&count=${this.pageSize}`;
      let res: Awaited<ReturnType<FetchLike>>;
      try {
        res = await this.fetchImpl(url, {
          headers: { Authorization: `Bearer ${this.opts.token}`, Accept: 'application/scim+json' },
        });
      } catch (err: unknown) {
        throw new DeckentError(
          'E_SCIM_SYNC',
          `[E_SCIM_SYNC] SCIM ${path} request failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (!res.ok) {
        throw new DeckentError('E_SCIM_SYNC', `[E_SCIM_SYNC] SCIM ${path} returned HTTP ${res.status}`);
      }
      const body = (await res.json()) as ScimListResponse;
      const page = body.Resources ?? [];
      out.push(...page);
      const total = typeof body.totalResults === 'number' ? body.totalResults : out.length;
      if (page.length === 0 || page.length < this.pageSize || out.length >= total) break;
      startIndex += page.length;
    }
    return out;
  }

  /** Join SCIM Group `members[].value` (SCIM user id) → set of group display names. */
  private indexGroupMembership(groups: ScimResource[]): Map<string, Set<string>> {
    const byUser = new Map<string, Set<string>>();
    for (const g of groups) {
      const name = g.displayName;
      if (!name) continue;
      for (const m of g.members ?? []) {
        if (!m.value) continue;
        let set = byUser.get(m.value);
        if (!set) { set = new Set<string>(); byUser.set(m.value, set); }
        set.add(name);
      }
    }
    return byUser;
  }

  /** Highest-privilege role among the user's role-mapped groups; else the configured default. */
  private roleForGroups(groupNames: Set<string>): Role {
    let best: Role | null = null;
    for (const name of groupNames) {
      const entry = this.opts.roleMap?.[name];
      if (!entry) continue;
      if (best === null || ROLE_RANK[entry.role] > ROLE_RANK[best]) best = entry.role;
    }
    return best ?? this.defaultRole;
  }

  /** Existing store records owned by THIS directory sync (connector+tenant, method='directory'). */
  private directoryRecords(): IdentityRecord[] {
    return this.store.exportBundle().records.filter(
      (r) => r.connector === this.opts.connector && r.tenantId === this.opts.tenantId && r.method === 'directory',
    );
  }

  /** Derive the email used as the identity key: primary → first → email-like userName. */
  private emailOf(u: ScimResource): string | null {
    const primary = u.emails?.find((e) => e.primary && e.value)?.value;
    if (primary) return primary;
    const first = u.emails?.find((e) => e.value)?.value;
    if (first) return first;
    if (u.userName && EMAIL_RE.test(u.userName)) return u.userName;
    return null;
  }
}
