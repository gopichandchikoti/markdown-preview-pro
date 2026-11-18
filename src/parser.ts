function parseMD(src:string):string {
  src = src.replace(/\r\n/g, '\n');

  function esc(s:string) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function inline(line:string) {
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
    return line;
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
      while (i < lines.length && !lines[i].startsWith('```')) {
        code += esc(lines[i]) + '\n';
        i++;
      }
      i++;
      const langLabel = lang ? '<span class="lang-label">' + esc(lang) + '</span>' : '';
      html += '<pre>' + langLabel + '<button class="copy-btn">' + esc(Content.t('editor.copy')) +
        '</button><code>' + code.replace(/\n$/, '') + '</code></pre>';
      continue;
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
  return html;
}

// ══════════════════════════════════════════════
