// TikTok integration using TikTok's *official* public embed APIs:
//   - oEmbed (https://developers.tiktok.com/doc/embed-videos) for caption/author/thumbnail
//   - Embed Player v1 (https://developers.tiktok.com/doc/embed-player) to stream the video
// Videos are played straight from TikTok's servers inside their official player.

const HOST_RE = /(^|\.)tiktok\.com$/i;

export function parseTikTokUrl(input) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!HOST_RE.test(url.hostname)) return null;
  const m = url.pathname.match(/\/video\/(\d{8,25})/);
  return { url: url.toString(), videoId: m ? m[1] : null };
}

export async function fetchOEmbed(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, { signal: ctrl.signal });
    if (!r.ok) return null;
    const j = await r.json();
    return {
      title: typeof j.title === 'string' ? j.title : '',
      authorName: typeof j.author_name === 'string' ? j.author_name : '',
      authorUrl: typeof j.author_url === 'string' ? j.author_url : '',
      thumbnailUrl: typeof j.thumbnail_url === 'string' && j.thumbnail_url.startsWith('https://') ? j.thumbnail_url : '',
      videoId: /^\d+$/.test(j.embed_product_id || '') ? j.embed_product_id : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
