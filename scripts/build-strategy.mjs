import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync('TEST_STRATEGY.md', 'utf8');

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function inline(value) {
  const code = [];
  let html = escapeHtml(value).replace(/`([^`]+)`/g, (_, text) => {
    const token = `\u0000${code.length}\u0000`;
    code.push(`<code>${text}</code>`);
    return token;
  });
  html = html
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => `<a href="${href}">${text}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return html.replace(/\u0000(\d+)\u0000/g, (_, index) => code[Number(index)]);
}

function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let list = null;
  let code = null;

  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list) html.push(`</${list}>`);
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.startsWith('```')) {
      flushParagraph();
      closeList();
      if (code) {
        html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        code = null;
      } else {
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[-:| ]+\|?\s*$/.test(lines[i + 1] ?? '')) {
      flushParagraph();
      closeList();
      const headers = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && (lines[i] ?? '').includes('|')) {
        rows.push(cells(lines[i] ?? ''));
        i++;
      }
      i--;
      html.push('<div class="strategy-table"><table><thead><tr>');
      for (const cell of headers) html.push(`<th scope="col">${inline(cell)}</th>`);
      html.push('</tr></thead><tbody>');
      for (const row of rows) {
        html.push('<tr>');
        for (const cell of row) html.push(`<td>${inline(cell)}</td>`);
        html.push('</tr>');
      }
      html.push('</tbody></table></div>');
      continue;
    }

    const item = /^\s*([-*+]|\d+\.)\s+(.+)$/.exec(line);
    if (item) {
      flushParagraph();
      const nextList = /^\d/.test(item[1]) ? 'ol' : 'ul';
      if (list !== nextList) {
        closeList();
        html.push(`<${nextList}>`);
        list = nextList;
      }
      html.push(`<li>${inline(item[2])}</li>`);
      continue;
    }

    if (/^\s*([-*_]\s*){3,}$/.test(line)) {
      flushParagraph();
      closeList();
      html.push('<hr>');
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  closeList();
  if (code) throw new Error('Unclosed code fence in TEST_STRATEGY.md');
  return html.join('\n');
}

const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'">
<title>Plchldr · test strategy</title>
<link rel="stylesheet" href="./fonts.css">
<link rel="stylesheet" href="./styles.css">
<link rel="stylesheet" href="./strategy.css">
</head>
<body class="strategy-body">
<header class="strategy-header">
  <nav aria-label="Site">
    <a href="./">Demo</a>
    <a href="./strategy.html" aria-current="page">Test strategy</a>
    <a href="./case_study.html">Case study</a>
    <a href="https://github.com/hugommartins/drawing-practice-timer">Source</a>
  </nav>
</header>
<main class="strategy-main">
${renderMarkdown(source)}
</main>
</body>
</html>
`;

writeFileSync('dist-demo/strategy.html', html);
