import { CapabilityRegistry } from './registry.js';
import { screenshotCapability } from './builtin/screenshot.js';
import { sendMailCapability } from './builtin/send-mail.js';
import { getMessage } from '../../cli/helpers/messages.js';
import type { MediaAttachment } from './types.js';
import type { MediaSink } from './execute.js';

export { CapabilityRegistry } from './registry.js';
export { runCapability, type MediaSink } from './execute.js';

export function createBuiltinRegistry(): CapabilityRegistry {
  const r = new CapabilityRegistry();
  r.register(screenshotCapability);
  r.register(sendMailCapability);
  return r;
}

interface MediaCapableConnector { id: string; sendMedia?(channelId: string, media: MediaAttachment): Promise<void> }

export function buildMediaSink(connector: MediaCapableConnector, lang: string, sendText: (channelId: string, text: string) => Promise<void>): MediaSink {
  return async (channelId, media) => {
    if (connector.sendMedia) { await connector.sendMedia(channelId, media); return; }
    await sendText(channelId, getMessage('cap.media.fallback', lang, { filename: media.filename }));
  };
}
