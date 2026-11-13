import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildDigestHtml, sendDigestEmail } from './email.js';
import { publishToWordPress } from './wordpress.js';

const RAINDROP_TOKEN = process.env.RAINDROP_TOKEN;
const RAINDROP_COLLECTION_ID = process.env.RAINDROP_COLLECTION_ID;
const DIGEST_DAYS = Number(process.env.DIGEST_DAYS ?? 7);
const OUTPUT_DIR = process.env.DIGEST_OUTPUT_DIR ?? 'digests';
const PER_PAGE = 50;

function requireEnv() {
  const missing = [];
  if (!RAINDROP_TOKEN) missing.push('RAINDROP_TOKEN');
  if (!RAINDROP_COLLECTION_ID) missing.push('RAINDROP_COLLECTION_ID');
  if (missing.length) {
    console.error(`Missing required environment variable(s): ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and fill in your values, or set them as GitHub Actions secrets.');
    process.exit(1);
  }
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function cleanText(text) {
  return text?.replace(/\s+/g, ' ').trim();
}

async function fetchWeeksRaindrops(startDate, endDate) {
  const search = `created:>${toISODate(startDate)} created:<${toISODate(endDate)}`;
  const items = [];
  let page = 0;
  let total = Infinity;

  while (items.length < total) {
    const url = new URL(`https://api.raindrop.io/rest/v1/raindrops/${RAINDROP_COLLECTION_ID}`);
    url.searchParams.set('search', search);
    url.searchParams.set('sort', '-created');
    url.searchParams.set('perpage', String(PER_PAGE));
    url.searchParams.set('page', String(page));

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${RAINDROP_TOKEN}` },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Raindrop API request failed (${response.status} ${response.statusText}): ${body}`);
    }

    const data = await response.json();
    const batch = data.items ?? [];
    items.push(...batch);
    total = data.count ?? items.length;

    if (batch.length < PER_PAGE) break;
    page += 1;
  }

  return items;
}

function formatRaindrop(item) {
  const title = cleanText(item.title) || item.link;
  const excerpt = cleanText(item.excerpt);
  const tags = item.tags?.length ? ` _(${item.tags.join(', ')})_` : '';
  return excerpt
    ? `- [${title}](${item.link}) — ${excerpt}${tags}`
    : `- [${title}](${item.link})${tags}`;
}

function formatDateRange(startDate, endDate) {
  const opts = { month: 'short', day: 'numeric' };
  const start = startDate.toLocaleDateString('en-US', opts);
  const end = endDate.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${start} – ${end}`;
}

function buildMarkdown(items, startDate, endDate) {
  const dateRange = formatDateRange(startDate, endDate);
  const isoDate = toISODate(endDate);
  const links = items.map(formatRaindrop).join('\n');

  return `---
title: "Weekly Links: ${dateRange}"
date: ${isoDate}
tags: ["weekly-links"]
---

## Weekly Links — ${dateRange}

${links}

*${items.length} link${items.length === 1 ? '' : 's'} saved to my [Raindrop.io](https://raindrop.io) reading list this week.*
`;
}

// DIGEST_END_DATE (YYYY-MM-DD) re-runs a past week, e.g. to backfill a missed blog post.
function resolveEndDate() {
  const override = process.env.DIGEST_END_DATE?.trim();
  if (!override) return new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(override)) {
    console.error(`DIGEST_END_DATE must look like 2026-11-09, got "${override}"`);
    process.exit(1);
  }
  return new Date(`${override}T12:00:00Z`);
}

// Runs one delivery step; a failure is logged and marks the run as failed
// without stopping the other steps.
async function runStep(name, fn) {
  try {
    await fn();
  } catch (err) {
    console.error(`${name} failed:`, err.message ?? err);
    process.exitCode = 1;
  }
}

async function main() {
  requireEnv();

  const wordpressOnly = process.env.WORDPRESS_ONLY === 'true';
  const endDate = resolveEndDate();
  const startDate = new Date(endDate.getTime() - DIGEST_DAYS * 24 * 60 * 60 * 1000);

  console.log(
    `Fetching raindrops from collection ${RAINDROP_COLLECTION_ID} between ${toISODate(startDate)} and ${toISODate(endDate)}...`
  );
  const items = await fetchWeeksRaindrops(startDate, endDate);

  if (items.length === 0) {
    console.log('No links saved in this window — skipping digest generation.');
    return;
  }

  if (wordpressOnly) {
    console.log('WORDPRESS_ONLY is set — skipping the digest file and email.');
  } else {
    const markdown = buildMarkdown(items, startDate, endDate);
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const filename = path.join(OUTPUT_DIR, `${toISODate(endDate)}-weekly-links.md`);
    writeFileSync(filename, markdown);

    console.log(`Wrote ${items.length} link(s) to ${filename}`);

    const dateRange = formatDateRange(startDate, endDate);
    await runStep('Email', () =>
      sendDigestEmail({
        subject: `Weekly Links: ${dateRange}`,
        html: buildDigestHtml(items, dateRange),
      })
    );
  }

  await runStep('WordPress', () => publishToWordPress(items, startDate, endDate));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
