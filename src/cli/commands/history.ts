import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { BRAIN_DIR, SPRINTS_DIR } from '../../core/constants.js';
import { print, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

interface SprintRecord {
  sprint: string;
  tasks: string;
  completed: string;
  noGoRate: string;
  coverage: string;
  duration: string;
  agents: string;
  skills: string;
}

export function formatDurationMs(raw: string): string {
  const msMatch = raw.match(/^(\d+)ms$/);
  if (!msMatch) return raw;
  const totalMs = parseInt(msMatch[1] ?? '0', 10);
  const totalSec = Math.floor(totalMs / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}

export function parseAgentSkillInfo(content: string): { agents: string[]; skills: string[] } {
  const agents: string[] = [];
  const skills: string[] = [];

  // Parse agent mentions: Agent: <name> or Agents: <list>
  const agentMatch = content.match(/Agents?:\s*(.+)/i);
  if (agentMatch) {
    const raw = (agentMatch[1] ?? '').trim();
    for (const part of raw.split(/[,;]+/)) {
      const trimmed = part.trim().replace(/\|.*/, '').trim();
      if (trimmed && trimmed !== '-') agents.push(trimmed);
    }
  }

  // Parse skill mentions: Skill: <name> or Skills: <list>
  const skillMatch = content.match(/Skills?:\s*(.+)/i);
  if (skillMatch) {
    const raw = (skillMatch[1] ?? '').trim();
    for (const part of raw.split(/[,;]+/)) {
      const trimmed = part.trim().replace(/\|.*/, '').trim();
      if (trimmed && trimmed !== '-') skills.push(trimmed);
    }
  }

  return { agents, skills };
}

export function parseSprintLog(content: string): SprintRecord {
  const titleMatch = content.match(/^#\s+(.+)/m);
  const totalMatch = content.match(/\|\s*Total Tasks\s*\|\s*(\d+)\s*\|/i);
  const completedMatch = content.match(/\|\s*Completed\s*\|\s*(\d+)\s*\|/i);
  const noGoMatch = content.match(/\|\s*No-Go\s*\|\s*(\d+)\s*\|/i);
  const coverageMatch = content.match(/\|\s*Coverage\s*\|\s*(\S+)\s*\|/i);
  const durationMatch = content.match(/\|\s*Duration\s*\|\s*(\S+)\s*\|/i);

  // Fallback to non-table format
  const fallbackTasks = content.match(/Tasks:\s*(\S+)/i);
  const fallbackCoverage = content.match(/Coverage:\s*(\S+)/i);
  const fallbackDuration = content.match(/Duration:\s*(\S+)/i);

  const totalTasks = totalMatch ? parseInt(totalMatch[1] ?? '0', 10) : NaN;
  const completed = completedMatch ? parseInt(completedMatch[1] ?? '0', 10) : NaN;
  const noGo = noGoMatch ? parseInt(noGoMatch[1] ?? '0', 10) : NaN;

  let noGoRate = '-';
  if (!isNaN(noGo) && !isNaN(totalTasks) && totalTasks > 0) {
    noGoRate = `${Math.round((noGo / totalTasks) * 100)}%`;
  } else if (!isNaN(noGo) && !isNaN(totalTasks) && totalTasks === 0) {
    noGoRate = '0%';
  }

  const rawDuration = durationMatch?.[1] ?? fallbackDuration?.[1] ?? '-';

  const { agents, skills } = parseAgentSkillInfo(content);

  return {
    sprint: titleMatch?.[1] ?? 'Unknown',
    tasks: totalMatch ? String(totalTasks) : (fallbackTasks?.[1] ?? '-'),
    completed: !isNaN(completed) ? String(completed) : '-',
    noGoRate,
    coverage: coverageMatch?.[1] ?? fallbackCoverage?.[1] ?? '-',
    duration: formatDurationMs(rawDuration),
    agents: agents.length > 0 ? agents.join(', ') : '-',
    skills: skills.length > 0 ? skills.join(', ') : '-',
  };
}

interface HistoryOpts {
  agent?: string;
  skill?: string;
}

function loadLearningData(root: string, sprintId: string): { agents: string[]; skills: string[] } {
  try {
    const learningDir = join(root, BRAIN_DIR, 'learning');
    if (!existsSync(learningDir)) return { agents: [], skills: [] };

    const agents: string[] = [];
    const skills: string[] = [];

    const learningFile = join(learningDir, `${sprintId}.json`);
    if (existsSync(learningFile)) {
      const raw = readFileSync(learningFile, 'utf-8');
      const data = JSON.parse(raw) as {
        agents?: string[];
        skills?: string[];
      };
      if (Array.isArray(data.agents)) agents.push(...data.agents);
      if (Array.isArray(data.skills)) skills.push(...data.skills);
    }

    return { agents, skills };
  } catch {
    return { agents: [], skills: [] };
  }
}

export function registerHistory(program: Command): void {
  program
    .command('history')
    .description('Show sprint history')
    .option('--agent <name>', 'Filter by agent name')
    .option('--skill <name>', 'Filter by skill name')
    .action((opts: HistoryOpts) => {
      const root = resolveProjectRoot();
      const sprintsDir = join(root, BRAIN_DIR, SPRINTS_DIR);

      if (!existsSync(sprintsDir)) {
        print('No sprint history found.');
        return;
      }

      const files = readdirSync(sprintsDir)
        .filter((f) => f.startsWith('sprint-') && f.endsWith('.md'))
        .sort();

      if (files.length === 0) {
        print('No sprint history found.');
        return;
      }

      const needsEnrichment = !!(opts.agent || opts.skill);

      let records: SprintRecord[] = files.map((f) => {
        const content = readFileSync(join(sprintsDir, f), 'utf-8');
        const record = parseSprintLog(content);

        // Enrich from learning data only when filtering by agent/skill
        if (needsEnrichment) {
          const sprintId = f.replace('.md', '');
          const learning = loadLearningData(root, sprintId);
          if (learning.agents.length > 0 && record.agents === '-') {
            record.agents = learning.agents.join(', ');
          }
          if (learning.skills.length > 0 && record.skills === '-') {
            record.skills = learning.skills.join(', ');
          }
        }

        return record;
      });

      // Apply filters
      if (opts.agent) {
        const agentName = opts.agent.toLowerCase();
        records = records.filter(
          (r) => r.agents.toLowerCase().includes(agentName),
        );
      }

      if (opts.skill) {
        const skillName = opts.skill.toLowerCase();
        records = records.filter(
          (r) => r.skills.toLowerCase().includes(skillName),
        );
      }

      if (records.length === 0) {
        print('No matching sprint history found.');
        return;
      }

      const headers = ['Sprint', 'Tasks', 'Completed', 'No-Go Rate', 'Coverage', 'Duration', 'Agents', 'Skills'];
      const rows = records.map((r) => [r.sprint, r.tasks, r.completed, r.noGoRate, r.coverage, r.duration, r.agents, r.skills]);
      print(formatTable(headers, rows));
    });
}
