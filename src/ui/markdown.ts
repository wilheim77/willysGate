/**
 * A tiny, purpose-built Markdown renderer for CREDITS.md — not a general Markdown engine.
 * Handles exactly what that file uses: `#`/`##` headings, `| a | b |` tables (rendered as
 * stacked label/value cards rather than literal `<table>`s, so they reflow on a phone
 * instead of forcing horizontal scroll), `**bold**`, backtick `code`, bare URLs, and
 * plain paragraphs.
 */
export function renderMarkdown(source: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const lines = source.split('\n');
  let i = 0;
  let paragraph: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    const p = document.createElement('p');
    p.append(...inline(paragraph.join(' ')));
    frag.append(p);
    paragraph = [];
  };

  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith('## ')) {
      flushParagraph();
      const h = document.createElement('h3');
      h.append(...inline(line.slice(3)));
      frag.append(h);
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      flushParagraph();
      const h = document.createElement('h2');
      h.append(...inline(line.slice(2)));
      frag.append(h);
      i++;
      continue;
    }
    if (line.trim().startsWith('|')) {
      flushParagraph();
      const tableLines: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('|')) {
        tableLines.push(lines[i]!);
        i++;
      }
      frag.append(renderTable(tableLines));
      continue;
    }
    if (line.trim() === '') {
      flushParagraph();
      i++;
      continue;
    }
    paragraph.push(line.trim());
    i++;
  }
  flushParagraph();
  return frag;
}

/** `| a | b | c |` rows, skipping the `|---|---|` separator, as one card per data row. */
function renderTable(rows: string[]): HTMLElement {
  const cells = rows.map((r) =>
    r
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim()),
  );
  const header = cells[0] ?? [];
  const body = cells.slice(1).filter((r) => !r.every((c) => /^:?-+:?$/.test(c)));
  const wrap = document.createElement('div');
  wrap.className = 'credits-table';
  for (const row of body) {
    const card = document.createElement('dl');
    card.className = 'credits-row';
    row.forEach((cell, col) => {
      if (!cell) return;
      const dt = document.createElement('dt');
      dt.textContent = header[col] ?? '';
      const dd = document.createElement('dd');
      dd.append(...inline(cell));
      card.append(dt, dd);
    });
    wrap.append(card);
  }
  return wrap;
}

/** `**bold**`, `` `code` ``, and bare `http(s)://…` URLs, inside one line of text. */
function inline(text: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`|(https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      const b = document.createElement('strong');
      b.textContent = m[1];
      out.push(b);
    } else if (m[2] !== undefined) {
      const c = document.createElement('code');
      c.textContent = m[2];
      out.push(c);
    } else if (m[3] !== undefined) {
      const a = document.createElement('a');
      a.href = m[3];
      a.textContent = m[3];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      out.push(a);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
