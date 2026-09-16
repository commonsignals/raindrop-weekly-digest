# Raindrop Weekly Digest

Generates a Markdown digest of links saved to a [Raindrop.io](https://raindrop.io) collection each week, ready to drop into any static site generator (Eleventy, Hugo, Astro, Jekyll, etc.) or read on its own.

Inspired by [Automated Weekly Links Posts with Raindrop.io and Eleventy](https://localghost.dev/blog/automated-weekly-links-posts-with-raindrop-io-and-eleventy/).

## How it works

1. A script queries the Raindrop.io API for everything saved to a specific collection in the last N days (default 7).
2. It renders the results as a Markdown file with YAML front matter (`digests/YYYY-MM-DD-weekly-links.md`).
3. A GitHub Actions workflow runs the script every Monday, commits the new file if there's anything to add, and can also be triggered manually.

## Setup

### 1. Get a Raindrop.io API token

1. Go to [app.raindrop.io/settings/integrations](https://app.raindrop.io/settings/integrations) and create a new app (any name).
2. Open the app and copy its **Test token** — that's all you need for personal use.

### 2. Find your collection ID

Open the collection in the Raindrop web app. The ID is the number in the URL:
`https://app.raindrop.io/my/`**`12345678`**

### 3. Configure locally

```bash
npm install
cp .env.example .env
```

Fill in `.env` with your token and collection ID, then run it:

```bash
npm run digest
```

This writes a file to `digests/`, e.g. `digests/2026-09-16-weekly-links.md`. If nothing was saved in the window, no file is written.

### 4. Automate with GitHub Actions

1. Push this project to a new GitHub repo.
2. In the repo, go to **Settings → Secrets and variables → Actions** and add two repository secrets:
   - `RAINDROP_TOKEN`
   - `RAINDROP_COLLECTION_ID`
3. Done — [`.github/workflows/weekly-digest.yml`](.github/workflows/weekly-digest.yml) runs every Monday at 08:00 UTC, generates the digest, and commits it if there's new content. Trigger it manually anytime from the **Actions** tab via "Run workflow".

## Configuration

Optional environment variables (set in `.env` locally, or as repo secrets/vars for Actions):

| Variable | Default | Description |
| --- | --- | --- |
| `DIGEST_DAYS` | `7` | How many days back to look for links |
| `DIGEST_OUTPUT_DIR` | `digests` | Where generated files are written |

## Using the output in your static site

Each generated file has YAML front matter (`title`, `date`, `tags`) and a Markdown body, so it should work as-is with most SSGs:

- **Eleventy / Astro / Jekyll**: point a content collection at `digests/`, or copy/symlink files into your posts directory as part of your build.
- **Hugo**: same idea — the front matter is compatible with Hugo's default archetypes.
- **No SSG**: read the Markdown directly, or pipe it through any Markdown-to-HTML renderer.

## Customizing the digest format

Edit `formatRaindrop` and `buildMarkdown` in [`src/generate-digest.js`](src/generate-digest.js) to change how each link and the overall post are rendered.
