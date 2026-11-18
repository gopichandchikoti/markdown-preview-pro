import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';

const MAX_BYTES = 4 * 1024 * 1024;
const rules = [
  { id:'private-key', pattern:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { id:'github-token', pattern:/\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/ },
  { id:'aws-access-key', pattern:/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { id:'stripe-secret', pattern:/\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/ },
];
export function scanText(text:string):string[] {
  return rules.filter(rule => rule.pattern.test(text)).map(rule => rule.id);
}
function git(args:string[]):string {
  return execFileSync('git', args, { encoding:'utf8', maxBuffer:16 * 1024 * 1024, windowsHide:true });
}
function scanBytes(path:string, bytes:Buffer):Array<{path:string;rule:string}> {
  if (bytes.includes(0)) return [];
  return scanText(bytes.toString('utf8')).map(rule => ({ path, rule }));
}
export function scanRepository() {
  const findings:Array<{path:string;rule:string}> = [];
  const skipped:string[] = [];
  const files = git(['ls-files','-z','--cached','--others','--exclude-standard']).split('\0').filter(Boolean);
  for (const path of files) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || stat.size > MAX_BYTES) { skipped.push(path); continue; }
    findings.push(...scanBytes(path, readFileSync(path)));
  }
  const objects = git(['rev-list','--objects','--all']).split('\n').filter(Boolean);
  let scannedBlobs = 0;
  for (const object of objects) {
    const [id, ...name] = object.split(' ');
    if (!name.length || git(['cat-file','-t',id]).trim() !== 'blob') continue;
    const path = name.join(' ');
    if (Number(git(['cat-file','-s',id])) > MAX_BYTES) { skipped.push('history:' + path); continue; }
    const bytes = execFileSync('git', ['cat-file','blob',id], { maxBuffer:MAX_BYTES, windowsHide:true });
    findings.push(...scanBytes('history:' + path, bytes)); scannedBlobs++;
  }
  return { files:files.length, scannedBlobs, findings, skipped };
}
if (require.main === module) {
  const result = scanRepository();
  // Only locations/rule IDs are emitted; matching values never appear in reports.
  console.log(JSON.stringify(result, null, 2));
  if (result.findings.length || result.skipped.length) process.exitCode = 1;
}
