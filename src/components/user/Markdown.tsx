import { Fragment, type ReactNode } from "react";

// Safe Markdown renderer for chat answers: builds React elements (no innerHTML), so
// model output cannot inject markup. Headings, paragraphs, lists, fenced code,
// blockquotes, tables, rules, and inline code/bold/italic/links.

function safeHref(url: string): string | null {
  return /^(https?:|mailto:)/i.test(url) ? url : null;
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))|(\*[^*\s][^*]*\*)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
const LINK = "font-medium text-primary underline-offset-4 hover:underline [overflow-wrap:anywhere]";

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const k = `${keyBase}-${i++}`;
    const tok = m[0];
    if (m[1]) {
      out.push(
        <code key={k} className="rounded bg-foreground/5 px-1 font-mono text-[14px] [overflow-wrap:anywhere]">
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (m[2]) out.push(<strong key={k} className="font-semibold">{inline(tok.slice(2, -2), k)}</strong>);
    else if (m[3]) {
      const sep = tok.indexOf("](");
      const label = tok.slice(1, sep);
      const href = safeHref(tok.slice(sep + 2, -1));
      out.push(
        href ? (
          <a key={k} href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
            {inline(label, k)}
          </a>
        ) : (
          label
        ),
      );
    } else if (m[4]) out.push(<em key={k}>{inline(tok.slice(1, -1), k)}</em>);
    else if (m[5]) {
      out.push(
        <a key={k} href={tok} target="_blank" rel="noopener noreferrer" className={LINK}>
          {tok}
        </a>,
      );
    }
    last = idx + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

const HEADING = {
  h1: "text-lg font-semibold",
  h2: "text-base font-semibold",
  h3: "text-base font-semibold",
  h4: "text-sm font-semibold",
} as const;

export default function Markdown({ text, cursor }: { text: string; cursor?: ReactNode }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    const k = `b${key++}`;

    const fence = line.match(/^\s*(```+|~~~+)\s*([\w+-]*)/);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={k} className="rounded-xl bg-background px-4 py-3 font-mono text-[13px] leading-6 whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
          <code data-lang={fence[2] || undefined}>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 4);
      const Tag = `h${level}` as keyof typeof HEADING;
      blocks.push(
        <Tag key={k} className={`${HEADING[Tag]} text-balance`}>
          {inline(heading[2], k)}
        </Tag>,
      );
      i++;
      continue;
    }
    if (/^\s*(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(line)) {
      blocks.push(<hr key={k} className="border-border-strong" />);
      i++;
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      blocks.push(
        <div key={k} className="overflow-x-auto rounded-xl border border-border-strong">
          <table className="w-full text-left text-sm">
            <thead className="bg-background">
              <tr>
                {head.map((c, j) => (
                  <th key={j} className="px-3 py-2 font-medium">
                    {inline(c, `${k}h${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-strong">
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, j) => (
                    <td key={j} className="px-3 py-2 align-top">
                      {inline(c, `${k}r${ri}c${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push(
        <blockquote key={k} className="border-l-2 border-border-strong pl-3 text-muted">
          <Markdown text={body.join("\n")} />
        </blockquote>,
      );
      continue;
    }
    const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+/);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[2]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (m && m[1].length <= listMatch[1].length + 1) {
          items.push(m[3]);
          i++;
        } else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) {
          items[items.length - 1] += `\n${lines[i++].trim()}`;
        } else break;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={k} className={`space-y-1 pl-5 ${ordered ? "list-decimal" : "list-disc"} marker:text-muted`}>
          {items.map((it, j) => (
            <li key={j}>
              {it.split("\n").map((part, pi) => (
                <Fragment key={pi}>
                  {pi > 0 && <br />}
                  {inline(part.replace(/^([-*+]|\d+[.)])\s+/, "• "), `${k}i${j}p${pi}`)}
                </Fragment>
              ))}
            </li>
          ))}
        </List>,
      );
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|\s*```|\s*~~~|\s*>|\s*([-*+]|\d+[.)])\s+)/.test(lines[i]) &&
      !(isTableRow(lines[i]) && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) {
      para.push(lines[i++]);
    }
    blocks.push(
      <p key={k}>
        {para.map((l, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(l, `${k}l${j}`)}
          </Fragment>
        ))}
      </p>,
    );
  }

  return (
    <div className="min-w-0 space-y-3 text-base text-pretty [overflow-wrap:anywhere]">
      {blocks}
      {cursor}
    </div>
  );
}
