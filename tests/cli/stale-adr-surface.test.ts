/**
 * Stale-ADR surface scan (task 563-001).
 *
 * deckent migrated from the legacy numeric ADR scheme (`ADR-0NN`) to the
 * governance/design scheme (`ADR-G-0NN` / `ADR-D-0NN`). Any surviving `ADR-0NN`
 * citation in text a USER reads is dead weight: the id no longer resolves, and
 * the sentence around it stops explaining what the command actually does.
 *
 * This is a mechanical, hermetic guard — it derives everything from the live
 * catalog and the live Commander program, holds no fixture copy of either, and
 * touches no filesystem or network state.
 *
 * Scope note (deliberate, see 563-001): mechanism text that is rendered into
 * generated agent/worker contracts is NOT user-facing help. Those keys keep
 * their `ADR-…` references and are pinned by a characterization assertion
 * below rather than filtered out of the scan.
 */

import { describe, it, expect } from 'vitest';
import type { Command } from 'commander';
import { MESSAGE_KEYS, getMessage } from '../../src/cli/helpers/messages.js';
import { buildProgram } from '../../src/cli/index.js';

/** Legacy numeric ADR ids only — `ADR-G-006` / `ADR-D-004` are current and legitimate. */
const STALE_ADR = /ADR-0\d\d/g;

const LANGS = ['en', 'tr'] as const;

/** Every `<key, lang, value>` triple in the catalog, both languages. */
function catalogEntries(): Array<{ key: string; lang: string; value: string }> {
  const entries: Array<{ key: string; lang: string; value: string }> = [];
  for (const key of MESSAGE_KEYS) {
    for (const lang of LANGS) {
      entries.push({ key, lang, value: getMessage(key, lang) });
    }
  }
  return entries;
}

function staleHits(value: string): string[] {
  return value.match(STALE_ADR) ?? [];
}

/** Walk the Commander tree depth-first (subcommands carry options too, e.g. `agent reclassify`). */
function allCommands(root: Command): Command[] {
  const out: Command[] = [];
  const walk = (cmd: Command): void => {
    for (const child of cmd.commands) {
      out.push(child);
      walk(child);
    }
  };
  walk(root);
  return out;
}

describe('stale-ADR surface scan — CLI message catalog', () => {
  it('exposes both languages for every key (scan precondition)', () => {
    const entries = catalogEntries();
    expect(entries.length).toBe(MESSAGE_KEYS.length * LANGS.length);
    // getMessage() falls back to the key itself when a key is missing; a scan over
    // key-strings would be vacuously clean, so assert we are reading real text.
    const echoedKeys = entries.filter((e) => e.value === e.key);
    expect(echoedKeys, 'every catalog key must resolve to real text in en+tr').toEqual([]);
  });

  it('no user-facing CLI help text cites a legacy numeric ADR id (no allowlist)', () => {
    const offenders = catalogEntries()
      .filter((e) => e.key.startsWith('cli.'))
      .filter((e) => staleHits(e.value).length > 0)
      .map((e) => `${e.key} [${e.lang}]: ${staleHits(e.value).join(', ')}`);

    expect(offenders).toEqual([]);
  });

  it('pins the only catalog keys still citing a legacy ADR id to generated mechanism text', () => {
    // Characterization, not an exemption filter: a NEW leak anywhere in the
    // catalog — user-facing or not — changes this set and fails the test.
    const leakingKeys = [
      ...new Set(catalogEntries().filter((e) => staleHits(e.value).length > 0).map((e) => e.key)),
    ].sort();

    expect(leakingKeys).toEqual(['workspace.worker.contract']);
  });
});

describe('stale-ADR surface scan — Commander command/option descriptions', () => {
  it('no command description cites a legacy numeric ADR id', () => {
    const offenders = allCommands(buildProgram())
      .filter((cmd) => staleHits(cmd.description()).length > 0)
      .map((cmd) => `${cmd.name()}: ${staleHits(cmd.description()).join(', ')}`);

    expect(offenders).toEqual([]);
  });

  it('no option description cites a legacy numeric ADR id', () => {
    const offenders: string[] = [];
    for (const cmd of allCommands(buildProgram())) {
      for (const opt of cmd.options) {
        const hits = staleHits(opt.description);
        if (hits.length > 0) offenders.push(`${cmd.name()} ${opt.flags}: ${hits.join(', ')}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps the functional sentence on the options this task rewrote', () => {
    const commands = allCommands(buildProgram());

    const doctor = commands.find((c) => c.name() === 'doctor');
    const fixImage = doctor?.options.find((o) => o.flags.includes('--fix-image'));
    expect(fixImage?.description).toContain('interactive confirmation');
    // 2026-08-25 (C-dalgası): 'cli.runtime.doctor.opt.fix_image' katalog metni
    // "worker docker image" yerine "worker image" der — yeni sözleşme.
    expect(fixImage?.description).toContain('rebuild the worker image');

    const reclassify = commands.find((c) => c.name() === 'reclassify');
    const noAudit = reclassify?.options.find((o) => o.flags.includes('--no-audit'));
    expect(noAudit?.description).toContain('audit-trail');
  });
});

describe('stale-ADR surface scan — rewritten catalog entries keep their meaning', () => {
  it('cli.process.desc still describes the process-mode surface in en+tr', () => {
    expect(getMessage('cli.process.desc', 'en')).toContain('submit tasks/capabilities');
    expect(getMessage('cli.process.desc', 'tr')).toContain('görev/yetenek gönderin');
  });

  it('cli.nervous.recommendations.desc still describes the Brain inbox in en+tr', () => {
    expect(getMessage('cli.nervous.recommendations.desc', 'en')).toContain('Brain inbox');
    expect(getMessage('cli.nervous.recommendations.desc', 'tr')).toContain('Brain gelen kutusunu');
  });
});
