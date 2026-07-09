import { Link } from "react-router-dom";
import PublicLayout from "../components/PublicLayout";
import { useArticles } from "../lib/useArticles";

/** Insights index — a card list of all articles, newest first. Public (no login).
 *  Article content is code-split (see useArticles) so the long-form bodies never
 *  weigh down the main app bundle. */
export default function Blog() {
  const all = useArticles();
  const articles = all ? [...all].sort((a, b) => b.date.localeCompare(a.date)) : null;
  return (
    <PublicLayout>
      <h1>Insights</h1>
      <p className="pub-lead">
        Plain-English explainers on screening, indicators, trading styles and the
        Indian markets. Educational only — never investment advice.
      </p>
      {!articles ? (
        <p className="pub-meta">Loading articles…</p>
      ) : (
        <div className="blog-list">
          {articles.map((a) => (
            <Link key={a.slug} to={`/blog/${a.slug}`} className="blog-card">
              <span className="blog-cat">{a.category}</span>
              <span className="blog-card-title">{a.title}</span>
              <span className="blog-card-sum">{a.summary}</span>
              <span className="blog-card-meta">{a.date} · {a.readMins} min read</span>
            </Link>
          ))}
        </div>
      )}
    </PublicLayout>
  );
}
