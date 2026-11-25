function parseMD(src:string):string {
  src = src.replace(/\r\n/g, '\n').replace(/\u0000/g, '');

  function esc(s:string) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  const EMOJI:Record<string,string> = { smile:'😄', grin:'😁', joy:'😂', wink:'😉', heart:'❤️', thumbsup:'👍', thumbsdown:'👎', tada:'🎉',
    rocket:'🚀', fire:'🔥', star:'⭐', sparkles:'✨', eyes:'👀', thinking:'🤔', warning:'⚠️', white_check_mark:'✅', x:'❌', bulb:'💡',
    memo:'📝', book:'📖', bug:'🐛', wrench:'🔧', lock:'🔒', zap:'⚡', clap:'👏', pray:'🙏', wave:'👋', coffee:'☕', check:'✔️', pushpin:'📌' };
  const KEYWORDS:Record<string,string> = {
    js: 'async await break case catch class const continue default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while yield',
    py: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield',
    sh: 'case do done elif else esac export fi for function if in local return then until while',
    sql: 'ALL AND AS ASC BY CREATE DELETE DESC DISTINCT DROP FROM GROUP HAVING INSERT INTO JOIN LEFT LIMIT NOT NULL ON OR ORDER OUTER RIGHT SELECT SET TABLE UPDATE VALUES WHERE',
    css: 'important', json: 'true false null', go: 'break case chan const continue default defer else fallthrough for func go if import interface map package range return select struct switch type var',
    rust: 'as break const continue crate else enum fn for if impl in let loop match mod mut pub ref return self Self static struct trait true false type use where while',
    java: 'abstract boolean break case catch class const continue default do else enum extends final finally for if implements import instanceof int interface long new null package private protected public return static super switch this throw throws true false try void while' };
  const ALIAS:Record<string,string> = { javascript:'js', jsx:'js', ts:'js', typescript:'js', tsx:'js', node:'js', python:'py', bash:'sh', shell:'sh', zsh:'sh',
    yaml:'sh', yml:'sh', golang:'go', rs:'rust', c:'java', cpp:'java', cs:'java', csharp:'java', kotlin:'java', php:'java', html:'html', xml:'html' };
  function highlight(code:string, lang:string):string {
    const key = ALIAS[lang.toLowerCase()] || lang.toLowerCase();
    if (!KEYWORDS[key] && key !== 'html') return esc(code);
    const comment = key === 'py' || key === 'sh' ? '#[^\\n]*' : key === 'sql' ? '--[^\\n]*' : key === 'html' ? '<!--[\\s\\S]*?-->' :
      '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/';
    const words = (KEYWORDS[key] || '').split(' ').filter(Boolean);
    const sql = key === 'sql';
    const pattern = new RegExp('(' + comment + ')|("(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)|(\\b\\d[\\d_.]*\\b)|(\\b[A-Za-z_][A-Za-z0-9_]*\\b)', 'g');
    let out = '', last = 0, m:RegExpExecArray|null;
    while ((m = pattern.exec(code))) {
      out += esc(code.slice(last, m.index)); last = m.index + m[0].length;
      const text = esc(m[0]);
      if (m[1]) out += '<span class="tok-c">' + text + '</span>';
      else if (m[2]) out += '<span class="tok-s">' + text + '</span>';
      else if (m[3]) out += '<span class="tok-n">' + text + '</span>';
      else if (words.includes(sql ? m[4].toUpperCase() : m[4])) out += '<span class="tok-k">' + text + '</span>';
      else out += text;
    }
    return out + esc(code.slice(last));
  }

  /* Footnote definitions are collected first so references can be numbered in order of use. */
  const footnotes = new Map<string,string>(); const footnoteOrder:string[] = [];
  src = src.split('\n').filter(row => {
    const m = row.match(/^\[\^([\w-]+)\]:\s+(.*)/); if (!m) return true; footnotes.set(m[1], m[2]); return false;
  }).join('\n');

  function inline(line:string) {
    const maths:string[] = [];
    line = line.split(/(`[^`]*`)/).map((part, k) => k % 2 ? part : part.replace(/(?<![\\$])\$(?!\s|\$)([^$\n]*?[^\s\\$])\$(?!\d)/g, (_all, tex) => {
      maths.push('<span class="math-inline">' + tex + '</span>'); return '\u0000' + (maths.length - 1) + '\u0000';
    })).join('');
    line = line.split(/(`[^`]*`)/).map((part, k) => k % 2 ? part : part.replace(/:([a-z0-9_]+):/g, (all, name) => EMOJI[name] || all)
      .replace(/\[\^([\w-]+)\]/g, (all, id) => {
        if (!footnotes.has(id)) return all;
        if (!footnoteOrder.includes(id)) footnoteOrder.push(id);
        const n = footnoteOrder.indexOf(id) + 1;
        return '<sup class="fn-sup"><a class="fn-ref fn-ref-' + n + '" href="#">' + n + '</a></sup>';
      })).join('');
    line = line.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    line = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    line = line.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    line = line.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
    line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    line = line.replace(/__(.+?)__/g, '<strong>$1</strong>');
    line = line.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    line = line.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');
    line = line.replace(/~~(.+?)~~/g, '<del>$1</del>');
    line = line.replace(/`([^`]+)`/g, '<code>$1</code>');
    line = line.replace(/(?<!"|\()(?<!\])(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return line.replace(/\u0000(\d+)\u0000/g, (_all, n) => maths[Number(n)] || '');
  }

  const lines = src.split('\n');
  let html = '';
  let i = 0;
  let inList = false;
  let listTag = '';

  function closeList() {
    if (inList) { html += '</' + listTag + '>'; inList = false; }
  }

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code blocks
    const fenceMatch = line.match(/^```(\w*)/);
    if (fenceMatch) {
      closeList();
      const lang = fenceMatch[1] || '';
      let code = '';
      i++;
      const raw:string[] = [];
      while (i < lines.length && !lines[i].startsWith('```')) { raw.push(lines[i]); i++; }
      code = highlight(raw.join('\n'), lang) + '\n';
      i++;
      if (lang.toLowerCase() === 'mermaid') { html += '<div class="mermaid-block">' + esc(raw.join('\n')) + '</div>'; continue; }
      const langLabel = lang ? '<span class="lang-label">' + esc(lang) + '</span>' : '';
      html += '<pre>' + langLabel + '<button class="copy-btn">' + esc(Content.t('editor.copy')) +
        '</button><code>' + code.replace(/\n$/, '') + '</code></pre>';
      continue;
    }

    // Display math: a $$ line starts a block that ends at the next $$ line (or one-line $$ x $$).
    const oneLine = line.match(/^\$\$(.+)\$\$\s*$/);
    if (oneLine) { closeList(); html += '<div class="math-block">' + esc(oneLine[1].trim()) + '</div>'; i++; continue; }
    if (/^\$\$\s*$/.test(line)) {
      let j = i + 1; const tex:string[] = [];
      while (j < lines.length && !/^\$\$\s*$/.test(lines[j])) { tex.push(lines[j]); j++; }
      if (j < lines.length) { closeList(); html += '<div class="math-block">' + esc(tex.join('\n')) + '</div>'; i = j + 1; continue; }
    }

    // HR
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      closeList(); html += '<hr>'; i++; continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (hMatch) {
      closeList();
      const lvl = hMatch[1].length;
      const txt = hMatch[2];
      const id = txt.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      html += '<h' + lvl + ' id="' + id + '">' + inline(esc(txt)) + '</h' + lvl + '>';
      i++; continue;
    }

    // Blockquote / Alerts
    if (line.startsWith('> ') || line === '>') {
      closeList();
      const bqLines = [];
      while (i < lines.length && (lines[i].startsWith('> ') || lines[i] === '>')) {
        bqLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      const bqText = bqLines.join('\n');
      const alertMatch = bqText.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*([\s\S]*)/i);
      if (alertMatch) {
        const type = alertMatch[1].toLowerCase();
        const content = alertMatch[2].trim();
        html += '<div class="md-alert md-alert-' + type + '"><div class="md-alert-title">' +
          esc(Content.t('alert.' + type + '.icon')) + ' ' + esc(Content.t('alert.' + type + '.label')) +
          '</div>' + content.split('\n').map(l => '<p>' + inline(esc(l)) + '</p>').join('') + '</div>';
      } else {
        html += '<blockquote>' + bqLines.map(l => '<p>' + inline(esc(l)) + '</p>').join('') + '</blockquote>';
      }
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*[-:]+[-|:\s]+\s*$/.test(lines[i + 1])) {
      closeList();
      const parseRow = (r:string) => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const headers = parseRow(line);
      const aligns = parseRow(lines[i + 1]).map(c => {
        if (c.startsWith(':') && c.endsWith(':')) return 'center';
        if (c.endsWith(':')) return 'right';
        return 'left';
      });
      let tHTML = '<table><thead><tr>';
      headers.forEach((h, j) => { tHTML += '<th style="text-align:' + (aligns[j]||'left') + '">' + inline(esc(h)) + '</th>'; });
      tHTML += '</tr></thead><tbody>';
      i += 2;
      while (i < lines.length && lines[i].includes('|')) {
        const cells = parseRow(lines[i]);
        tHTML += '<tr>';
        cells.forEach((c, j) => { tHTML += '<td style="text-align:' + (aligns[j]||'left') + '">' + inline(esc(c)) + '</td>'; });
        tHTML += '</tr>'; i++;
      }
      tHTML += '</tbody></table>';
      html += tHTML;
      continue;
    }

    // Task list
    const taskMatch = line.match(/^(\s*)[-*]\s+\[([ xX])\]\s+(.*)/);
    if (taskMatch) {
      if (!inList || listTag !== 'ul') { closeList(); html += '<ul class="task-list">'; inList = true; listTag = 'ul'; }
      const checked = taskMatch[2] !== ' ' ? 'checked' : '';
      html += '<li><input type="checkbox" ' + checked + '> <span>' + inline(esc(taskMatch[3])) + '</span></li>';
      i++; continue;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)/);
    if (ulMatch) {
      if (!inList || listTag !== 'ul') { closeList(); html += '<ul>'; inList = true; listTag = 'ul'; }
      html += '<li>' + inline(esc(ulMatch[2])) + '</li>';
      i++; continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+\.\s+(.*)/);
    if (olMatch) {
      if (!inList || listTag !== 'ol') { closeList(); html += '<ol>'; inList = true; listTag = 'ol'; }
      html += '<li>' + inline(esc(olMatch[2])) + '</li>';
      i++; continue;
    }

    closeList();

    if (line.trim() === '') { i++; continue; }

    html += '<p>' + inline(esc(line)) + '</p>';
    i++;
  }
  closeList();
  if (footnoteOrder.length) {
    html += '<hr class="fn-rule"><ol class="footnotes">' + footnoteOrder.map((id, k) => '<li class="fn-def fn-def-' + (k + 1) + '"><span>' +
      inline(esc(footnotes.get(id) || '')) + '</span> <a class="fn-back fn-back-' + (k + 1) + '" href="#">↩</a></li>').join('') + '</ol>';
  }
  return html;
}

// ══════════════════════════════════════════════
