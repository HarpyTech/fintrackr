import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { resolvePageMeta } from '../lib/pageMeta';

function setMeta(selector: string, attr: string, value: string) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

/**
 * Mirrors the active route's title and description into document.title and
 * the description / Open Graph tags. Renders nothing.
 */
export default function RouteMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = resolvePageMeta(pathname);
    const title = meta.documentTitle || `${meta.title} · FinTrackr`;
    document.title = title;
    setMeta('meta[name="description"]', 'content', meta.description);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', meta.description);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', meta.description);
  }, [pathname]);

  return null;
}
