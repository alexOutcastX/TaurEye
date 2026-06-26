import { type ReactNode } from "react";
import { Link } from "react-router-dom";

// A tiny, dependency-free Markdown renderer — enough for our article/content
// pages: # / ## / ### headings, paragraphs, - and 1. lists, **bold**, *italic*,
// `code`, and [text](url) links (internal links use the SPA router). Line-based
// so a heading directly above its paragraph (single newline) still works. It is
// NOT a full CommonMark parser; keep article source to these constructs.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[2]) out.push(<strong key={k}>{m[2]}</strong>);
    else if (m[4]) out.push(<em key={k}>{m[4]}</em>);
    else if (m[6]) out.push(<code key={k}>{m[6]}</code>);
    else if (m[8]) {
      const href = m[9];
      out.push(
        href.startsWith("/") ? (
          <Link key={k} to={href}>{m[8]}</Link>
        ) : (
          <a key={k} href={href} target="_blank" rel="noopener noreferrer">{m[8]}</a>
        ),
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").trim().split("\n");
  const out: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushPara = () => {
    if (para.length) {
      out.push(<p key={key}>{inline(para.join(" "), `p${key}`)}</p>);
      key += 1;
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const { ordered, items } = list;
      out.push(
        ordered ? (
          <ol key={key}>{items.map((it, i) => <li key={i}>{inline(it, `o${key}-${i}`)}</li>)}</ol>
        ) : (
          <ul key={key}>{items.map((it, i) => <li key={i}>{inline(it, `u${key}-${i}`)}</li>)}</ul>
        ),
      );
      key += 1;
      list = null;
    }
  };
  const flushAll = () => { flushList(); flushPara(); };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushAll(); continue; }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flushAll();
      const txt = inline(h[2], `h${key}`);
      out.push(h[1].length === 1 ? <h1 key={key}>{txt}</h1> : h[1].length === 2 ? <h2 key={key}>{txt}</h2> : <h3 key={key}>{txt}</h3>);
      key += 1;
      continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; }
      list.items.push(ul[1]);
      continue;
    }
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      flushPara();
      if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; }
      list.items.push(ol[1]);
      continue;
    }

    flushList();
    para.push(line);
  }
  flushAll();
  return <>{out}</>;
}
