/**
 * TaurEye wordmark image — WebP with a PNG fallback and explicit intrinsic
 * dimensions (246×72) so the browser reserves space (no layout shift). CSS
 * (.lp-wordmark / .login-wordmark) scales it by height; width stays auto.
 */
export default function Wordmark({ className }: { className?: string }) {
  return (
    <picture>
      <source srcSet="/wordmark.webp" type="image/webp" />
      <img src="/wordmark.png" alt="TaurEye" className={className} width={246} height={72} />
    </picture>
  );
}
