// ═══ deckent_watch MCP Tool ══════════════════════════════════════════
// Push-based subscription to sprint event stream via MCP logging notifications.
// Sprint 145 — Task 145-014

import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { eventBus } from '../../orchestra/event-bus.js';
import { getCurrentSprintId } from '../../monitor/sprint-state.js';
import { mcpToolDescription } from './description-catalog.js';

const CHANNEL_KEYWORDS = [
  'PHASE',
  'TASK_ASSIGN',
  'HEARTBEAT',
  'RESULT',
  'ALERT',
  'NOTIFY',
  'METRIC',
] as const;

type ChannelKeyword = typeof CHANNEL_KEYWORDS[number];

export function registerWatch(server: McpServer): void {
  server.registerTool(
    'deckent_watch',
    {
      title: 'Watch Sprint Events',
      description: mcpToolDescription('deckent_watch'),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        sprintId: z
          .string()
          .optional()
          .describe('Sprint ID to watch. Defaults to current active sprint.'),
        channels: z
          .array(z.enum(CHANNEL_KEYWORDS))
          .optional()
          .describe(
            'Filter events by channel keyword. Only events whose channel string contains one of these keywords are forwarded. Omit for all channels.',
          ),
        tail: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .default(20)
          .describe('Number of recent events to backfill (0-100, default 20).'),
      }),
    },
    async ({ sprintId, channels, tail }) => {
      const root = process.cwd();
      const resolvedSprintId = sprintId ?? getCurrentSprintId(root) ?? 'unknown';
      const tailN = tail ?? 20;

      // Backfill: read last N events from JSONL file
      const recent = await eventBus.tail(root, resolvedSprintId, tailN);
      let backfillCount = 0;

      for (const event of recent) {
        if (channels && channels.length > 0) {
          const matchesChannel = channels.some((c: ChannelKeyword) =>
            event.channel.includes(c),
          );
          if (!matchesChannel) continue;
        }

        try {
          await server.sendLoggingMessage({
            level: event.channel.includes('ALERT') ? 'warning' : 'info',
            logger: `deckent.sprint.${resolvedSprintId}`,
            data: event,
          });
          backfillCount++;
        } catch {
          // Client disconnected during backfill — return early
          return {
            content: [
              {
                type: 'text' as const,
                text: `Backfill interrupted after ${backfillCount} events.`,
              },
            ],
          };
        }
      }

      // Subscribe to live events
      const channelCodes = channels as ChannelKeyword[] | undefined;
      const unsubscribe = eventBus.subscribe(
        resolvedSprintId,
        undefined, // We do our own channel filtering below
        async (event) => {
          // Channel keyword filter
          if (channelCodes && channelCodes.length > 0) {
            const matches = channelCodes.some((c) => event.channel.includes(c));
            if (!matches) return;
          }

          try {
            await server.sendLoggingMessage({
              level: event.channel.includes('ALERT') ? 'warning' : 'info',
              logger: `deckent.sprint.${resolvedSprintId}`,
              data: event,
            });
          } catch {
            // Client disconnected — clean up subscription
            unsubscribe();
          }
        },
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: `Subscribed to sprint ${resolvedSprintId}. Backfilled ${backfillCount} recent events. Channels: ${channels?.join(', ') ?? 'all'}.`,
          },
        ],
      };
    },
  );
}
