// Minimal glob → RegExp. Supports `**` (any chars incl. `/`), `*` (any chars
// except `/`), and literals. No dependency (ADR-010).
//
// `**/` is translated to `(?:.*/)?` so it matches zero or more leading path
// segments (including zero) — standard glob semantics. A naive `.*/` would
// require at least one slash and miss root-level matches (e.g. `**/*.template.md`
// would fail to match `foo.template.md`).
function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?'; // '**/' — zero or more leading segments
          i += 2;
        } else {
          re += '.*'; // trailing/standalone '**' — any chars incl. '/'
          i++;
        }
      } else {
        re += '[^/]*'; // '*' — any chars within a single segment
      }
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

export function matchGlob(path: string, pattern: string): boolean {
  return globToRegExp(pattern).test(path);
}
