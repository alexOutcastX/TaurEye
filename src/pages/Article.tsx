import { Link, Navigate, useParams } from "react-router-dom";
import PublicLayout from "../components/PublicLayout";
import { Markdown } from "../lib/markdown";
import { ARTICLES, getArticle } from "../content/articles";

/** A single Insights article, rendered from Markdown. Public (no login). */
export default function Article() {
  const { slug } = useParams<{ slug: string }>();
  const article = slug ? getArticle(slug) : undefined;
  if (!article) return <Navigate to="/blog" replace />;

  const related = ARTICLES.filter(
    (a) => a.slug !== article.slug && a.category === article.category,
  ).slice(0, 3);

  return (
    <PublicLayout>
      <article>
        <Link to="/blog" className="pub-back">‹ Insights</Link>
        <p className="pub-meta">{article.category} · {article.date} · {article.readMins} min read</p>
        <h1>{article.title}</h1>
        <p className="pub-lead">{article.summary}</p>
        <Markdown source={article.body} />
      </article>

      {related.length > 0 && (
        <aside className="blog-related">
          <h3>Related reading</h3>
          {related.map((r) => (
            <Link key={r.slug} to={`/blog/${r.slug}`}>{r.title}</Link>
          ))}
        </aside>
      )}
    </PublicLayout>
  );
}
