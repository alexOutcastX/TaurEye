import { Link, Navigate, useParams } from "react-router-dom";
import PublicLayout from "../components/PublicLayout";
import { Markdown } from "../lib/markdown";
import { useArticles } from "../lib/useArticles";

/** A single Insights article, rendered from Markdown. Public (no login).
 *  Content is code-split (useArticles); only redirect to /blog once the chunk
 *  has loaded and the slug is genuinely unknown. */
export default function Article() {
  const { slug } = useParams<{ slug: string }>();
  const all = useArticles();

  if (!all) {
    return (
      <PublicLayout>
        <p className="pub-meta">Loading…</p>
      </PublicLayout>
    );
  }

  const article = slug ? all.find((a) => a.slug === slug) : undefined;
  if (!article) return <Navigate to="/blog" replace />;

  const related = all
    .filter((a) => a.slug !== article.slug && a.category === article.category)
    .slice(0, 3);

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
