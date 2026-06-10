import { Fragment, type ReactNode } from "react";
import "./Markdown.css";

// Minimal, safe Markdown renderer for AI output (no raw HTML injection).
// Handles: # / ## / ### headings, - and * bullet lists, **bold** inline,
// blank-line paragraph breaks. Enough for the model's structured replies.

function inline(text: string): ReactNode[] {
  // Split on **bold** spans, alternating normal / strong.
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
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
    blocks.push(<p key={i}>{inline(line)}</p>);
  });
  flushList();

  return <div className={`md ${className ?? ""}`}>{blocks}</div>;
}
