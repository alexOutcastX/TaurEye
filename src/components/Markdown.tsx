import { Fragment, type ReactNode } from "react";
import "./Markdown.css";

// Minimal, safe Markdown renderer for AI output (no raw HTML injection).
// Handles: # / ## / ### headings, - and * bullet lists, **bold** and *italic*
// inline, blank-line paragraph breaks, and degrades | pipe | tables | into
// clean key-value lines (the model is told not to emit tables, but if it does
// they must not render as raw pipes).

function inline(text: string): ReactNode[] {
  // **bold** first, then *italic* inside the remaining plain fragments.
  return text.split(/\*\*(.+?)\*\*/g).flatMap((part, i) => {
    if (i % 2 === 1) return [<strong key={`b${i}`}>{part}</strong>];
    return part.split(/\*(.+?)\*/g).map((p, j) =>
      j % 2 === 1 ? <em key={`i${i}-${j}`}>{p}</em> : <Fragment key={`t${i}-${j}`}>{p}</Fragment>,
    );
  });
}

export default function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];

  const flushList = () => {
    if (list.length) {
      blocks.push(<ul key={`ul${blocks.length}`}>{list}</ul>);
      list = [];
    }
  };

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) {
      flushList();
      return;
    }
    // Horizontal rules / table separators ("---", "|---|---|"): drop entirely.
    if (/^\|?[-:\s|]+\|?$/.test(line) && /-/.test(line)) {
      flushList();
      return;
    }
    // Pipe-table row -> key-value line ("Label: value") or dot-joined cells.
    if (line.startsWith("|") && line.endsWith("|")) {
      flushList();
      const cells = line.slice(1, -1).split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length === 0) return;
      // Drop generic table-header rows ("Field | Value" etc.) — pure noise.
      const plain = cells.map((c) => c.replace(/\*/g, "").toLowerCase());
      if (cells.length === 2 && /^(field|metric|item|label|parameter)s?$/.test(plain[0]) && /^values?$/.test(plain[1])) {
        return;
      }
      blocks.push(
        <p key={`kv${i}`} className="md-kv">
          {cells.length === 2 ? (
            <>
              <strong>{inline(cells[0].replace(/\*\*/g, ""))}:</strong> {inline(cells[1])}
            </>
          ) : (
            inline(cells.join(" · "))
          )}
        </p>,
      );
      return;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      list.push(<li key={`li${i}`}>{inline(bullet[1])}</li>);
      return;
    }
    flushList();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const content = inline(h[2]);
      blocks.push(
        level === 1 ? <h3 key={i}>{content}</h3> : level === 2 ? <h4 key={i}>{content}</h4> : <h5 key={i}>{content}</h5>,
      );
      return;
    }
    // Numbered list items render as paragraphs with the number kept.
    blocks.push(<p key={i}>{inline(line)}</p>);
  });
  flushList();

  return <div className={`md ${className ?? ""}`}>{blocks}</div>;
}
