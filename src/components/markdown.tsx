import { Fragment } from "react";

/** Minimal, safe Markdown renderer (headings, lists, bold, tables, paragraphs). No HTML injection. */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      out.push(<h3 key={i} className="mt-3 mb-1 text-sm font-semibold first:mt-0">{inline(h[2])}</h3>);
      i++;
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <div key={`t${i}`} className="my-2 overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/60"><tr>{head?.map((c, j) => <th key={j} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{inline(c)}</th>)}</tr></thead>
            <tbody>{body.map((r, ri) => <tr key={ri} className="border-t">{r.map((c, j) => <td key={j} className="px-2 py-1 whitespace-nowrap num">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      const ordered = /^\s*\d+\./.test(line);
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
        i++;
      }
      const List = ordered ? "ol" : "ul";
      out.push(<List key={`l${i}`} className={`my-1 space-y-0.5 pl-5 text-sm ${ordered ? "list-decimal" : "list-disc"}`}>{items.map((it, j) => <li key={j}>{inline(it)}</li>)}</List>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\||\s*([-*]|\d+\.)\s)/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    out.push(<p key={`p${i}`} className="text-sm leading-relaxed text-foreground/90">{inline(para.join(" "))}</p>);
  }
  return <div className="space-y-1">{out}</div>;
}
