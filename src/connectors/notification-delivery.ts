/** Durable owner-notification outbox.
 *
 * Producers only append immutable JSONL records.  The bot owns delivery and
 * appends acknowledgements after a successful send; therefore stopping the bot
 * never drops events and a crash between send and acknowledgement may only
 * cause an idempotent re-delivery of the same stable event id.
 */
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const NOTIFICATION_RUNTIME_DIRECTORY = join('.deckent', 'runtime');
export const NOTIFICATION_OUTBOX_FILE = 'owner-notifications.jsonl';
export const NOTIFICATION_RECEIPTS_FILE = 'owner-notification-receipts.jsonl';

export type OwnerNotificationKind =
  | 'sprint-started'
  | 'no-go'
  | 'fix-started'
  | 'paused'
  | 'terminal'
  | 'approval-requested'
  /**
   * A competitive-intelligence alert. It shares the durable outbox with run
   * notifications but is not a run event and asks the owner for nothing, so it
   * must not be filed under `approval-requested` where an approval inbox would
   * pick it up as a pending decision.
   */
  | 'intelligence-alert';

export interface OwnerNotification {
  readonly version: 1;
  readonly id: string;
  readonly kind: OwnerNotificationKind;
  readonly sprintId: string;
  readonly title: string;
  readonly message: string;
  readonly lang: 'en' | 'tr';
  readonly createdAt: string;
}

export interface EnqueueOwnerNotificationInput {
  readonly id?: string;
  readonly kind: OwnerNotificationKind;
  readonly sprintId: string;
  readonly title: string;
  readonly message: string;
  readonly lang: string;
  readonly createdAt?: string;
}

/** Narrow bot transport seam; secrets are deliberately absent. */
export interface OwnerNotificationTransport {
  sendMessage(message: string, idempotencyKey: string): Promise<void>;
}

export interface DeliveryOptions {
  readonly backoffMs?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export interface DeliveryResult {
  readonly delivered: number;
  readonly pending: number;
}

interface DeliveryReceipt {
  readonly version: 1;
  readonly notificationId: string;
  readonly deliveredAt: string;
}

function runtimePath(root: string, file: string): string {
  return join(root, NOTIFICATION_RUNTIME_DIRECTORY, file);
}

function appendJsonLine(path: string, value: unknown): void {
  appendFileSync(path, `${JSON.stringify(value)}\n`, {
    encoding: 'utf8',
    flag: 'a',
    mode: 0o600,
  });
}

/** Append an event before any best-effort live notification is attempted. */
export function enqueueOwnerNotification(
  root: string,
  input: EnqueueOwnerNotificationInput,
): OwnerNotification {
  mkdirSync(join(root, NOTIFICATION_RUNTIME_DIRECTORY), {
    recursive: true,
    mode: 0o700,
  });
  const notification: OwnerNotification = {
    version: 1,
    id: input.id ?? randomUUID(),
    kind: input.kind,
    sprintId: input.sprintId,
    title: input.title,
    message: input.message,
    lang: input.lang === 'tr' ? 'tr' : 'en',
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  appendJsonLine(runtimePath(root, NOTIFICATION_OUTBOX_FILE), notification);
  return notification;
}

function readJsonLines<T>(path: string): T[] {
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as T];
        } catch {
          return [];
        }
      });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export function readPendingOwnerNotifications(root: string): OwnerNotification[] {
  const acknowledged = new Set(
    readJsonLines<DeliveryReceipt>(runtimePath(root, NOTIFICATION_RECEIPTS_FILE))
      .map((receipt) => receipt.notificationId),
  );
  const seen = new Set<string>();
  return readJsonLines<OwnerNotification>(runtimePath(root, NOTIFICATION_OUTBOX_FILE))
    .filter((notification) => {
      if (notification.version !== 1 || acknowledged.has(notification.id) || seen.has(notification.id)) {
        return false;
      }
      seen.add(notification.id);
      return true;
    });
}

function isTransient(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = (error as Error & { status?: number }).status;
  return status === 429 || (status !== undefined && status >= 500)
    || /(?:timeout|timed out|ECONNRESET|EAI_AGAIN)/i.test(error.message);
}

async function sendWithOneRetry(
  transport: OwnerNotificationTransport,
  notification: OwnerNotification,
  options: DeliveryOptions,
): Promise<void> {
  const body = `${notification.title}\n${notification.message}`;
  try {
    await transport.sendMessage(body, notification.id);
  } catch (error: unknown) {
    if (!isTransient(error)) throw error;
    const sleep = options.sleep ?? ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
    await sleep(options.backoffMs ?? 250);
    await transport.sendMessage(body, notification.id);
  }
}

/**
 * Deliver the durable prefix in order.  Stop on the first failure so later
 * records cannot overtake it.  An acknowledgement is appended only after send.
 */
export async function deliverPendingOwnerNotifications(
  root: string,
  transport: OwnerNotificationTransport,
  options: DeliveryOptions = {},
): Promise<DeliveryResult> {
  const pending = readPendingOwnerNotifications(root);
  let delivered = 0;
  for (const notification of pending) {
    try {
      await sendWithOneRetry(transport, notification, options);
    } catch {
      break;
    }
    const receipt: DeliveryReceipt = {
      version: 1,
      notificationId: notification.id,
      deliveredAt: new Date().toISOString(),
    };
    appendJsonLine(runtimePath(root, NOTIFICATION_RECEIPTS_FILE), receipt);
    delivered += 1;
  }
  return { delivered, pending: pending.length - delivered };
}
