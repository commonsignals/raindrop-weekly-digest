// Publishes the weekly links as a "Saved links" post on a WordPress site via the REST API.
//
// Matches the format of the existing saved-links posts on benrmatthews.com:
//   <h3><a href="url">Title</a><a id="anchor"></a></h3>
//   <p>Description</p>
//   <p>domain.com · <a href="category-link">Category</a></p>
//   <p><a href="tag-link">tag</a> ...</p>
//
// Auth is HTTP Basic (username + password). On sites where application passwords
// work, use one; on benrmatthews.com the miniOrange "WP REST API Authentication"
// plugin accepts the normal WordPress login password this way.

const REQUIRED_VARS = ['WP_URL', 'WP_USER', 'WP_APP_PASS'];
const USER_AGENT = 'raindrop-weekly-digest/1.0 (+https://github.com/commonsignals/raindrop-weekly-digest)';
const LIVE_STATUSES = 'publish,future,draft,pending,private';

function escapeHtml(str = '') {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str = '') {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

function decodeEntities(str = '') {
  return String(str)
    .replace(/&#0?38;|&amp;/g, '&')
    .replace(/&#0?39;|&#8217;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanText(text) {
  return text?.replace(/\s+/g, ' ').trim() ?? '';
}

function anchorId(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function domainOf(link) {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function longDate(date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function shortDate(date, withYear = false) {
  const opts = { day: 'numeric', month: 'short', timeZone: 'UTC' };
  if (withYear) opts.year = 'numeric';
  return date.toLocaleDateString('en-GB', opts);
}

// Pure formatting: no network. `category` is { name, link } or null;
// `tagLinks` maps a Raindrop tag name to its WordPress tag URL.
export function buildPost(items, startDate, endDate, { category = null, tagLinks = new Map() } = {}) {
  const title = `Saved links: week of ${longDate(startDate)}`;
  const slug = `saved-links-${isoDate(startDate)}`;
  const count = items.length;

  const blocks = [
    `<!-- ${count} link${count === 1 ? '' : 's'} saved ${shortDate(startDate)} to ${shortDate(endDate, true)} -->`,
  ];

  for (const item of items) {
    const itemTitle = cleanText(item.title) || item.link;
    const description = cleanText(item.excerpt);
    const domain = domainOf(item.link);
    const categoryPart = category?.name
      ? ` · <a href="${escapeAttr(category.link)}">${escapeHtml(category.name)}</a>`
      : '';

    const tags = (item.tags ?? [])
      .map((tag) => {
        const link = tagLinks.get(tag);
        return link ? `<a href="${escapeAttr(link)}">${escapeHtml(tag)}</a>` : escapeHtml(tag);
      })
      .join(' ');

    let block =
      `<h3><a href="${escapeAttr(item.link)}">${escapeHtml(itemTitle)}</a><a id="${anchorId(itemTitle)}"></a></h3>\n` +
      (description ? `<p>${escapeHtml(description)}</p>\n` : '') +
      `<p>${escapeHtml(domain)}${categoryPart}</p>`;
    if (tags) block += `\n<p>${tags}</p>`;

    blocks.push(block);
  }

  return { title, slug, content: blocks.join('\n\n') };
}

function statusHint(status) {
  if (status === 401) {
    return '\nHint: WordPress rejected the login. Check the WP_USER and WP_APP_PASS secrets (WP_APP_PASS is the WordPress login password when using the miniOrange plugin) and that the miniOrange REST API Authentication plugin is still active.';
  }
  if (status === 403) {
    return '\nHint: the request was refused before or by WordPress. Check the miniOrange plugin settings, any security plugin or host firewall rules, and the .htaccess rules for wp-json.';
  }
  if (status === 404) {
    return '\nHint: the REST API route was not found. Check WP_URL and that the REST API is enabled.';
  }
  return '';
}

function wpConfig() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length) return { missing };

  const base = process.env.WP_URL.replace(/\/+$/, '');
  const token = Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASS}`).toString('base64');
  return {
    base,
    api: `${base}/wp-json/wp/v2`,
    auth: `Basic ${token}`,
    categoryId: Number(process.env.SAVED_LINKS_CATEGORY_ID) || 0,
    status: process.env.WP_POST_STATUS || 'publish',
  };
}

async function wpRequest(cfg, method, route, body) {
  const response = await fetch(`${cfg.api}${route}`, {
    method,
    headers: {
      Authorization: cfg.auth,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = undefined;
  }

  if (!response.ok) {
    const error = new Error(
      `WordPress ${method} ${route} failed (${response.status} ${response.statusText}): ${text.slice(0, 500)}${statusHint(response.status)}`
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }
  if (data === undefined) {
    throw new Error(
      `WordPress ${method} ${route} returned something other than JSON (often a firewall or challenge page): ${text.slice(0, 300)}`
    );
  }
  return data;
}

async function getCategory(cfg) {
  if (!cfg.categoryId) return null;
  try {
    const cat = await wpRequest(cfg, 'GET', `/categories/${cfg.categoryId}?_fields=id,name,link`);
    return { name: decodeEntities(cat.name), link: cat.link };
  } catch (err) {
    console.warn(`Warning: could not look up category ${cfg.categoryId}; posting without the category link. ${err.message}`);
    return null;
  }
}

async function resolveTag(cfg, name) {
  const wanted = name.toLowerCase();
  const found = await wpRequest(cfg, 'GET', `/tags?search=${encodeURIComponent(name)}&per_page=100&_fields=id,name,slug,link`);
  const match = found.find((tag) => decodeEntities(tag.name).toLowerCase() === wanted);
  if (match) return match;

  try {
    return await wpRequest(cfg, 'POST', '/tags', { name });
  } catch (err) {
    // WordPress reports an existing term (e.g. same slug, different case) with its id.
    const termId = err.data?.code === 'term_exists' ? err.data?.data?.term_id : undefined;
    if (termId) return wpRequest(cfg, 'GET', `/tags/${termId}?_fields=id,name,slug,link`);
    throw err;
  }
}

async function resolveTags(cfg, items) {
  const names = [...new Set(items.flatMap((item) => item.tags ?? []))];
  const ids = [];
  const links = new Map();

  for (const name of names) {
    try {
      const tag = await resolveTag(cfg, name);
      ids.push(tag.id);
      links.set(name, tag.link);
    } catch (err) {
      console.warn(`Warning: could not resolve tag "${name}"; it will appear unlinked. ${err.message}`);
    }
  }
  return { ids, links };
}

// Returns the post URL, or false if WordPress isn't configured.
export async function publishToWordPress(items, startDate, endDate) {
  if (process.env.WP_DRY_RUN === 'true') {
    const post = buildPost(items, startDate, endDate);
    console.log(`WordPress dry run. Title: ${post.title}\nSlug: ${post.slug}\n\n${post.content}`);
    return false;
  }

  const cfg = wpConfig();
  if (cfg.missing) {
    console.log(`Skipping WordPress — missing environment variable(s): ${cfg.missing.join(', ')}`);
    return false;
  }

  const slug = `saved-links-${isoDate(startDate)}`;
  const existing = await wpRequest(
    cfg,
    'GET',
    `/posts?slug=${encodeURIComponent(slug)}&status=${LIVE_STATUSES}&_fields=id,link,status`
  );
  if (existing.length) {
    console.log(`WordPress already has ${slug} (${existing[0].status}): ${existing[0].link} — not posting again.`);
    return existing[0].link;
  }

  const category = await getCategory(cfg);
  const tags = await resolveTags(cfg, items);
  const post = buildPost(items, startDate, endDate, { category, tagLinks: tags.links });

  const payload = {
    title: post.title,
    slug: post.slug,
    content: post.content,
    status: cfg.status,
    tags: tags.ids,
  };
  if (cfg.categoryId) payload.categories = [cfg.categoryId];

  const created = await wpRequest(cfg, 'POST', '/posts', payload);
  console.log(`Published to WordPress (${created.status}): ${created.link}`);
  return created.link;
}
