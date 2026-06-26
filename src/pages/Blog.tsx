import { Link } from "react-router-dom";
import PublicLayout from "../components/PublicLayout";
import { ARTICLES } from "../content/articles";

/** Insights index — a card list of all articles, newest first. Public (no login). */
export default function Blog() {
  const articles = [...ARTICLES].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <PublicLayout>
      <h1>Insights</h1>
      <p className="pub-lead">
        Plain-English explainers on screening, indicators and the Indian markets.
        Educational only — never investment advice.
      </p>
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
    </PublicLayout>
  );
}
