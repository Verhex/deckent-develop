import type {
  LiveApprovalAuthentication,
  LiveApprovalAuthenticator,
  LiveApprovalReauthenticationContext,
  LiveApprovalSessionProof,
} from './approval-decision-ingress.js';
import { ApprovalLiveSessionStore } from './approval-live-session.js';

export interface LocalTerminalAuthenticationAssertion {
  readonly actorId: string;
  readonly tenantId: string;
  readonly role?: string;
  readonly authorityRef: string;
  readonly authenticatedAt: string;
  readonly expiresAt: string;
}

/** Trusted host-terminal seam. Connectors may implement the same provider contract independently. */
export interface LocalTerminalReauthenticationProvider {
  reauthenticate(
    context: LiveApprovalReauthenticationContext,
  ): Promise<LocalTerminalAuthenticationAssertion | null>;
}

export interface LocalTerminalLiveApprovalAuthenticatorOptions {
  readonly provider: LocalTerminalReauthenticationProvider;
  readonly sessions: ApprovalLiveSessionStore;
  readonly now?: () => Date;
}

export class LocalTerminalLiveApprovalAuthenticator implements LiveApprovalAuthenticator {
  private readonly now: () => Date;

  constructor(private readonly options: LocalTerminalLiveApprovalAuthenticatorOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async reauthenticate(context: LiveApprovalReauthenticationContext): Promise<LiveApprovalAuthentication | null> {
    const assertion = await this.options.provider.reauthenticate(context);
    const now = this.now().getTime();
    if (!assertion
      || assertion.actorId !== context.request.userId
      || assertion.tenantId !== context.request.tenantId
      || !assertion.authorityRef
      || !Number.isFinite(Date.parse(assertion.authenticatedAt))
      || !Number.isFinite(Date.parse(assertion.expiresAt))
      || Date.parse(assertion.authenticatedAt) > now
      || Date.parse(assertion.expiresAt) <= now) return null;
    return this.options.sessions.issue({
      actorId: assertion.actorId,
      tenantId: assertion.tenantId,
      role: assertion.role ?? null,
      authorityRef: assertion.authorityRef,
      requestDigest: context.requestDigest,
      action: context.action,
      channel: context.channel,
      authenticatedAt: assertion.authenticatedAt,
      expiresAt: assertion.expiresAt,
    });
  }

  isSessionActive(proof: LiveApprovalSessionProof, context: LiveApprovalReauthenticationContext, now: Date): boolean {
    return this.options.sessions.isActive(proof, context, now);
  }
}
