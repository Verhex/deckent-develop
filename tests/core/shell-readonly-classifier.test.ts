// tests/core/shell-readonly-classifier.test.ts
// ═══ 7111 TERMINAL-READONLY-APPROVAL-001 — allowlist read-only shell parser ═══
// Deterministic matrix (POSIX + PowerShell), adversarial constructs, path
// containment against a project root, protected authority trees, typed reason
// codes. Pure module: no fs, no spawn.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROTECTED_READ_PATHS,
  checkAwkProgram,
  checkSedScript,
  classifyReadOnlyShellCommand,
  resolveShellDialectForPlatform,
  type ReadOnlyShellReasonCode,
} from '../../src/core/shell-readonly-classifier.js';

const ROOT = '/srv/projects/deckent';
const WIN_ROOT = 'C:\\Users\\alp\\deckent';

const posix = (command: string) => classifyReadOnlyShellCommand(command, { projectRoot: ROOT, dialect: 'posix', platform: 'linux' });
const powershell = (command: string) => classifyReadOnlyShellCommand(command, { projectRoot: WIN_ROOT, dialect: 'powershell' });

describe('classifyReadOnlyShellCommand — POSIX read-only allowlist', () => {
  it.each<[string, 'none' | 'low']>([
    ["sed -n '1,50p' docs/MASTER-PLAN.md", 'none'],
    ["sed -n '10,20p' file | head -5", 'none'],
    ["sed -e 's/a/b/g' -e '/x/d' f", 'none'],
    ["sed -n '/start/,/end/p' f", 'none'],
    ["sed '1!G;h;$!d' f", 'none'],
    ["awk 'NR>=10 && NR<=20' file", 'none'],
    ["awk -F'|' '{print $1}' file", 'none'],
    ["awk '{ if (x > 3) print }' f", 'none'],
    ['cat f | grep -n foo | wc -l', 'none'],
    ['grep "foo$" file', 'none'],
    ['grep -rn foo src', 'low'],
    ['grep -l foo src/*.ts', 'none'],
    ['grep -r x . 2>&1 | head', 'low'],
    ['cat f 2>/dev/null', 'none'],
    ['wc -l < f', 'none'],
    ['wc -l docs/MASTER-PLAN.md', 'none'],
    ['head -c 1000 f', 'none'],
    ['tail -n +5 f', 'none'],
    ['ls -la', 'none'],
    ['ls -R src', 'low'],
    ["find . -name '*.ts'", 'low'],
    ["find . -name '*.md' -path '*docs*' -not -path '*/node_modules/*'", 'low'],
    ['find . \\( -name a -o -name b \\)', 'low'],
    ["jq -r '.[] | .name' f.json", 'none'],
    ['sort -u f | uniq -c', 'none'],
    ['cut -d, -f1 f | tr a-z A-Z', 'none'],
    ['nl -ba f', 'none'],
    ['stat f', 'none'],
    ['du -sh .', 'low'],
    ['diff a b', 'none'],
    ['git status', 'low'],
    ['git log --oneline -20', 'low'],
    ['git log --pretty=format:%H -5', 'low'],
    ['git diff -M --stat', 'low'],
    ['git diff HEAD~1 -- src/x.ts', 'low'],
    ['git branch -vv', 'low'],
    ["git branch --list 'feat/*'", 'low'],
    ['git show HEAD:src/a.ts', 'low'],
    ['git blame -L 10,20 src/a.ts', 'low'],
    ['git rev-parse --show-toplevel', 'low'],
    ['git ls-files src | head', 'low'],
    ['git stash list', 'low'],
    ['git remote -v', 'low'],
    ['git config --get user.name', 'low'],
    ['git tag -l "v*"', 'low'],
    ['echo hello', 'none'],
    ['echo "> literal"', 'none'],
    ['cat f # comment', 'none'],
    ['cat f; echo done', 'none'],
    ['cat f && cat g || echo x', 'none'],
    ['ls -la; pwd; whoami', 'none'],
    ['node --version', 'none'],
    ['npm -v', 'none'],
    ['env', 'low'],
    ['printenv PATH', 'low'],
    ['ps aux', 'low'],
    ['df -h', 'low'],
    ['which node', 'none'],
    ['rg needle src', 'low'],
    ['less README.md', 'none'],
    ['cat .brain/exports/summary.md', 'none'],
    ['ls .brain', 'none'],
    ["cat 'file with space.txt'", 'none'],
    ['cat -- -file', 'none'],
    ['tr -d "\\n" < f', 'none'],
  ])('%s → read-only (risk %s)', (command, risk) => {
    const verdict = posix(command);
    expect(verdict, command).toMatchObject({ readOnly: true, risk, reasonCode: 'READ_ONLY', dialect: 'posix' });
    expect(verdict.stageCount).toBeGreaterThan(0);
  });
});

describe('classifyReadOnlyShellCommand — POSIX fail-closed rejections', () => {
  it.each<[string, ReadOnlyShellReasonCode]>([
    ["sed -n '1p' f; rm -rf x", 'PROGRAM_NOT_ALLOWLISTED'],
    ['cat f > g', 'OUTPUT_REDIRECTION'],
    ['echo hello > file', 'OUTPUT_REDIRECTION'],
    ['cat input >> output', 'OUTPUT_REDIRECTION'],
    ['grep x $(rm y)', 'COMMAND_SUBSTITUTION'],
    ['echo `id`', 'COMMAND_SUBSTITUTION'],
    ['find . -exec rm {} \\;', 'BRACE_EXPANSION'],
    ["find . -exec rm '{}' \\;", 'MUTATING_FLAG'],
    ['find . -execdir sh -c x', 'MUTATING_FLAG'],
    ['find . -ok rm', 'MUTATING_FLAG'],
    ['find . -delete', 'MUTATING_FLAG'],
    ["awk '{system(\"id\")}' file", 'SCRIPT_UNSAFE'],
    ["awk '{print $1 > \"out\"}' file", 'SCRIPT_UNSAFE'],
    ["awk 'BEGIN{while((\"id\"|getline l)>0)print l}'", 'SCRIPT_UNSAFE'],
    ['awk -f s.awk f', 'MUTATING_FLAG'],
    ["sed -i 's/a/b/' f", 'MUTATING_FLAG'],
    ["sed -n 's/a/b/w out' f", 'SCRIPT_UNSAFE'],
    ['git push origin main', 'GIT_SUBCOMMAND_NOT_READ_ONLY'],
    ['git branch new', 'GIT_SUBCOMMAND_NOT_READ_ONLY'],
    ['git log --output=x', 'GIT_SUBCOMMAND_NOT_READ_ONLY'],
    ['git -c core.pager=cat log', 'FLAG_NOT_ALLOWLISTED'],
    ['git grep -O vim foo', 'GIT_SUBCOMMAND_NOT_READ_ONLY'],
    ['git stash drop', 'GIT_SUBCOMMAND_NOT_READ_ONLY'],
    ['git config user.name x', 'GIT_SUBCOMMAND_NOT_READ_ONLY'],
    ['git tag v1', 'GIT_SUBCOMMAND_NOT_READ_ONLY'],
    ['git remote add x y', 'GIT_SUBCOMMAND_NOT_READ_ONLY'],
    ['git worktree add x', 'GIT_SUBCOMMAND_NOT_READ_ONLY'],
    ['git symbolic-ref -d refs/x', 'GIT_SUBCOMMAND_NOT_READ_ONLY'],
    ['cat f | tee g', 'OUTPUT_TEE'],
    ['cat f | xargs rm', 'XARGS'],
    ['sudo cat f', 'PRIVILEGE_ESCALATION'],
    ["node -e 'x'", 'INTERPRETER'],
    ['cat f | bash', 'INTERPRETER'],
    ['cat f | python', 'INTERPRETER'],
    ['eval cat f', 'EVAL'],
    ['env sh -c true', 'EVAL'],
    ['FOO=bar cat f', 'ENV_ASSIGNMENT'],
    ['cat f &', 'BACKGROUND_JOB'],
    ['(cat f)', 'SUBSHELL'],
    ['cat {a,b}', 'BRACE_EXPANSION'],
    ['cat <<EOF\nhi\nEOF', 'HEREDOC'],
    ['cat f |& head', 'PIPE_STDERR'],
    ['echo $HOME', 'VARIABLE_EXPANSION'],
    ['cat "$FILE"', 'VARIABLE_EXPANSION'],
    ['sort -o out f', 'MUTATING_FLAG'],
    ["sort '--output=out' f", 'MUTATING_FLAG'],
    ["sort '-o' out f", 'MUTATING_FLAG'],
    ['sort \\-o out f', 'MUTATING_FLAG'],
    ["sort ''-o out f", 'MUTATING_FLAG'],
    ["sed '-i' 's/a/b/' f", 'MUTATING_FLAG'],
    ["find . '-delete'", 'MUTATING_FLAG'],
    ["git log '--output=x'", 'GIT_SUBCOMMAND_NOT_READ_ONLY'],
    ['uniq f out', 'OUTPUT_FILE_POSITIONAL'],
    ['cat f | sort -o /dev/stdout', 'MUTATING_FLAG'],
    ['date -s x', 'MUTATING_FLAG'],
    ['rg --pre cat x', 'MUTATING_FLAG'],
    ['curl http://x', 'PROGRAM_NOT_ALLOWLISTED'],
    ['yes', 'PROGRAM_NOT_ALLOWLISTED'],
    ['/usr/bin/cat f', 'PROGRAM_PATH'],
    ['./cat f', 'PROGRAM_PATH'],
    ['', 'EMPTY_COMMAND'],
    ['   ', 'EMPTY_COMMAND'],
    ['echo "unterminated', 'UNPARSEABLE'],
  ])('%s → not read-only (%s)', (command, reasonCode) => {
    const verdict = posix(command);
    expect(verdict, command).toMatchObject({ readOnly: false, risk: null, reasonCode });
  });
});

describe('classifyReadOnlyShellCommand — path containment + protected trees', () => {
  it.each<[string, ReadOnlyShellReasonCode]>([
    ['cat /etc/passwd', 'PATH_OUTSIDE_ROOT'],
    ['cat ~/.ssh/id_rsa', 'PATH_OUTSIDE_ROOT'],
    ['cat ../secret', 'PATH_OUTSIDE_ROOT'],
    ['cat src/../../x', 'PATH_OUTSIDE_ROOT'],
    ['grep -r x /', 'PATH_OUTSIDE_ROOT'],
    ['git log -- ../x', 'PATH_OUTSIDE_ROOT'],
    ['git -C ../other status', 'PATH_OUTSIDE_ROOT'],
    ['diff a ../b', 'PATH_OUTSIDE_ROOT'],
    ['cat .env', 'PATH_PROTECTED'],
    ['cat src/../.env', 'PATH_PROTECTED'],
    ['cat .env.production', 'PATH_PROTECTED'],
    ['cat .brain/memory.db', 'PATH_PROTECTED'],
    ['stat .brain/memory.db', 'PATH_PROTECTED'],
    ['cat .brain/*', 'PATH_PROTECTED'],
    ['cat .git/config', 'PATH_PROTECTED'],
    ['ls .git', 'PATH_PROTECTED'],
    ['cat .deckent/private/x.json', 'PATH_PROTECTED'],
    ['cat file.pem', 'PATH_PROTECTED'],
    ['cat keys/prod.key', 'PATH_PROTECTED'],
    ['cat id_rsa', 'PATH_PROTECTED'],
    ['cat notes/credentials', 'PATH_PROTECTED'],
    ['head -1 .*', 'PATH_PROTECTED'],
    ['cat *', 'PATH_PROTECTED'],
  ])('%s → %s', (command, reasonCode) => {
    expect(posix(command), command).toMatchObject({ readOnly: false, reasonCode });
  });

  it('reports examined paths root-relative and dedupes them', () => {
    const verdict = posix('cat src/a.ts docs/b.md src/a.ts');
    expect(verdict.paths).toEqual(['src/a.ts', 'docs/b.md']);
    expect(verdict.programs).toEqual(['cat']);
  });

  it('accepts an absolute path INSIDE the project root', () => {
    expect(posix(`cat ${ROOT}/src/a.ts`)).toMatchObject({ readOnly: true, paths: ['src/a.ts'] });
  });

  it('honours a caller-supplied protected set (replaces the default)', () => {
    const custom = classifyReadOnlyShellCommand('cat vault/token', { projectRoot: ROOT, protectedPaths: ['vault/'] });
    expect(custom).toMatchObject({ readOnly: false, reasonCode: 'PATH_PROTECTED', detail: 'vault/token' });
    expect(classifyReadOnlyShellCommand('cat .env', { projectRoot: ROOT, protectedPaths: ['vault/'] }).readOnly).toBe(true);
  });

  it('falls back to lexical containment without a project root', () => {
    expect(classifyReadOnlyShellCommand('cat src/a.ts')).toMatchObject({ readOnly: true });
    expect(classifyReadOnlyShellCommand('cat ../a.ts')).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' });
    expect(classifyReadOnlyShellCommand('cat /etc/hosts')).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' });
  });

  it('ships the documented default protected set', () => {
    expect(DEFAULT_PROTECTED_READ_PATHS).toEqual(expect.arrayContaining(['.git/', '.brain/memory.db', '.deckent/private/', '.env', '*.pem']));
  });
});

describe('classifyReadOnlyShellCommand — PowerShell dialect (native Windows deckent_bash)', () => {
  it.each<[string, 'none' | 'low']>([
    ['Get-Content docs/MASTER-PLAN.md -TotalCount 50', 'none'],
    ['gc file -Tail 20', 'none'],
    ['gc f -To 5', 'none'],
    ['cat file | Select-String foo', 'none'],
    ['Select-String -Pattern foo -Path src/*.ts', 'none'],
    ['type file', 'none'],
    ['dir src -Recurse', 'low'],
    ['Get-ChildItem -Recurse -Filter *.ts | Select-Object -First 5', 'low'],
    ['ls | sort', 'low'],
    ['findstr /S /N foo *.ts', 'none'],
    ['cat f 2>&1', 'none'],
    ['Get-Content f 2>$null', 'none'],
    ["Get-Content 'C:\\Users\\alp\\deckent\\src\\a.ts'", 'none'],
    ["sed -n '1,5p' f", 'none'],
    ['git status', 'low'],
    ['echo hi', 'none'],
  ])('%s → read-only (%s)', (command, risk) => {
    expect(powershell(command), command).toMatchObject({ readOnly: true, risk, dialect: 'powershell' });
  });

  it.each<[string, ReadOnlyShellReasonCode]>([
    ['Get-Content f | Out-File g', 'OUTPUT_TEE'],
    ['Get-Content f > g', 'OUTPUT_REDIRECTION'],
    ['cat f; Remove-Item g', 'PROGRAM_NOT_ALLOWLISTED'],
    ['Get-Content f -Wait', 'MUTATING_FLAG'],
    ['Get-Content f -Cred x', 'MUTATING_FLAG'],
    ['gc f -T 5', 'PARAMETER_AMBIGUOUS'],
    ['Get-Content $env:USERPROFILE\\x', 'VARIABLE_EXPANSION'],
    ['cat f | % { rm $_ }', 'SCRIPT_BLOCK'],
    ['& cat f', 'CALL_OPERATOR'],
    ['Get-Content (Get-Item f)', 'SUBEXPRESSION'],
    ['Get-Content @(f)', 'SPLATTING'],
    ['cat f --% > g', 'STOP_PARSING'],
    ['Get-Content C:\\Windows\\win.ini', 'PATH_OUTSIDE_ROOT'],
    ['dir C:\\', 'PATH_OUTSIDE_ROOT'],
    ['Get-Content ..\\secret', 'PATH_OUTSIDE_ROOT'],
    ['Get-Content .env', 'PATH_PROTECTED'],
    ['Select-String foo -Path .env', 'PATH_PROTECTED'],
    ['git push', 'GIT_SUBCOMMAND_NOT_READ_ONLY'],
    ["Invoke-Expression 'x'", 'EVAL'],
    ['iex x', 'EVAL'],
    ['find . -name x', 'PROGRAM_AMBIGUOUS'],
    ['cat f < g', 'INPUT_REDIRECTION_UNSAFE'],
  ])('%s → not read-only (%s)', (command, reasonCode) => {
    expect(powershell(command), command).toMatchObject({ readOnly: false, reasonCode });
  });
});

describe('script grammars', () => {
  it('sed: accepts print/address scripts, rejects write/exec/read commands', () => {
    expect(checkSedScript('1,50p')).toBeNull();
    expect(checkSedScript('/a/,/b/{p;q}')).toBeNull();
    expect(checkSedScript('s/a/b/g;s/c/d/')).toBeNull();
    expect(checkSedScript('$=')).toBeNull();
    expect(checkSedScript('1!G;h;$!d')).toBeNull();
    expect(checkSedScript('s/a/b/e')).toBe('SCRIPT_UNSAFE');
    expect(checkSedScript('w out')).toBe('SCRIPT_UNSAFE');
    expect(checkSedScript('r /etc/passwd')).toBe('SCRIPT_UNSAFE');
    expect(checkSedScript('1e id')).toBe('SCRIPT_UNSAFE');
    expect(checkSedScript('1k')).toBe('SCRIPT_UNPARSEABLE');
    expect(checkSedScript('s/a/b')).toBe('SCRIPT_UNPARSEABLE');
  });

  it('awk: distinguishes comparison `>` from redirection, rejects pipes/system/getline', () => {
    expect(checkAwkProgram('NR>=10 && NR<=20')).toBeNull();
    expect(checkAwkProgram('{ if (a > b) print }')).toBeNull();
    expect(checkAwkProgram('$3 > 100 { print $1 }')).toBeNull();
    expect(checkAwkProgram('/foo|bar/ { n++ } END { print n }')).toBeNull();
    expect(checkAwkProgram('{ print > "file" }')).toBe('SCRIPT_UNSAFE');
    expect(checkAwkProgram('{ print | "sort" }')).toBe('SCRIPT_UNSAFE');
    expect(checkAwkProgram('{ system("id") }')).toBe('SCRIPT_UNSAFE');
    expect(checkAwkProgram('{ "id" | getline x }')).toBe('SCRIPT_UNSAFE');
    expect(checkAwkProgram('@load "x"')).toBe('SCRIPT_UNSAFE');
    expect(checkAwkProgram('{ print "unterminated }')).toBe('SCRIPT_UNPARSEABLE');
  });
});

describe('resolveShellDialectForPlatform', () => {
  it('maps native Windows to PowerShell and every other host to POSIX sh', () => {
    expect(resolveShellDialectForPlatform('win32')).toBe('powershell');
    expect(resolveShellDialectForPlatform('linux')).toBe('posix');
    expect(resolveShellDialectForPlatform('darwin')).toBe('posix');
  });
});
