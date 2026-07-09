// Lazy article loading: the Insights bodies are long-form (10+ articles at
// 2,500+ words), so the content module is code-split out of the main bundle
// and fetched only when a /blog page mounts. The type-only import is erased at
// compile time, so it doesn't defeat the split.
import { useEffect, useState } from "react";
import type { Article } from "../content/articles";

let cache: Article[] | null = null;

/** All articles, or null while the content chunk is loading. */
export function useArticles(): Article[] | null {
  const [arts, setArts] = useState<Article[] | null>(cache);
  useEffect(() => {
    if (cache) return;
    let alive = true;
    void import("../content/articles").then((m) => {
      cache = m.ARTICLES;
      if (alive) setArts(m.ARTICLES);
    });
    return () => {
      alive = false;
    };
  }, []);
  return arts;
}
