// utils/extractUrlMeta.js - Fetch URL HTML and extract Open Graph / meta for preview
const axios = require('axios');
const cheerio = require('cheerio');

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; LiteNewsBot/1.0)';

/**
 * @param {string} url - Full URL to fetch
 * @returns {Promise<{ title: string, description: string, image: string|null, siteName: string|null }>}
 */
async function extractUrlMeta(url) {
  const normalized = normalizeUrl(url);
  const res = await axios.get(normalized, {
    timeout: 15000,
    maxRedirects: 5,
    responseType: 'text',
    headers: { 'User-Agent': DEFAULT_USER_AGENT },
    validateStatus: (status) => status >= 200 && status < 400
  });
  const html = res.data;
  const $ = cheerio.load(html);

  const getMeta = (property) => {
    const el = $(`meta[property="${property}"], meta[name="${property}"]`);
    const content = el.attr('content');
    return (content && content.trim()) || null;
  };

  const title = getMeta('og:title') || getMeta('twitter:title') || $('title').text().trim() || '';
  const description = getMeta('og:description') || getMeta('twitter:description') || getMeta('description') || '';
  let image = getMeta('og:image') || getMeta('twitter:image');
  if (image && image.startsWith('//')) image = 'https:' + image;
  else if (image && image.startsWith('/')) {
    try {
      const u = new URL(normalized);
      image = u.origin + image;
    } catch (_) {}
  }
  const siteName = getMeta('og:site_name') || null;

  return {
    title: title.slice(0, 500),
    description: description.slice(0, 2000),
    image: image || null,
    siteName: siteName ? siteName.slice(0, 200) : null
  };
}

function normalizeUrl(input) {
  const s = (input || '').trim();
  if (!s) throw new Error('URL is required');
  if (!/^https?:\/\//i.test(s)) return 'https://' + s;
  return s;
}

module.exports = { extractUrlMeta, normalizeUrl };
