# Raindrop Weekly Digest

Generates a Markdown digest of links saved to a [Raindrop.io](https://raindrop.io) collection each week, ready to drop into any static site generator (Eleventy, Hugo, Astro, Jekyll, etc.) or read on its own.

Inspired by [Automated Weekly Links Posts with Raindrop.io and Eleventy](https://localghost.dev/blog/automated-weekly-links-posts-with-raindrop-io-and-eleventy/).

## How it works

1. A script queries the Raindrop.io API for everything saved to a specific collection in the last N days (default 7).
2. It renders the results as a Markdown file with YAML front matter (`digests/YYYY-MM-DD-weekly-links.md`).
3. If SMTP settings are configured, it also emails the same digest as HTML.
4. A GitHub Actions workflow runs the script every Monday, commits the new file if there's anything to add, and can also be triggered manually.

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

### 4. (Optional) Email the digest

To also send the digest by email, set these in `.env`:

| Variable | Description |
| --- | --- |
| `SMTP_HOST` | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | `587` (STARTTLS) or `465` (SSL) |
| `SMTP_USERNAME` | Your full email address |
| `SMTP_PASSWORD` | An **app password**, not your normal login password |
| `EMAIL_FROM` | Sending address — for Gmail this should match `SMTP_USERNAME` |
| `EMAIL_TO` | Where to send the digest |

For Gmail or Google Workspace:

1. Turn on 2-Step Verification on the sending account, if it isn't already.
2. Generate an app password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
3. Use that 16-character password as `SMTP_PASSWORD`.

If any of these six variables are missing, the script just skips emailing (no error) — so it's safe to leave unset until you're ready.

### 5. (Optional) Publish to WordPress

The same run can publish a "Saved links: week of D Month YYYY" post (slug `saved-links-YYYY-MM-DD`) to a WordPress site through the REST API. Each link gets a linked heading, its Raindrop excerpt, the domain and category, and its Raindrop tags as WordPress tags (created if missing).

| Name | Where | Description |
| --- | --- | --- |
| `WP_URL` | secret | e.g. `https://benrmatthews.com` |
| `WP_USER` | secret | WordPress username |
| `WP_APP_PASS` | secret | Application password, or the login password if the site uses the miniOrange REST API Authentication plugin with Basic auth |
| `SAVED_LINKS_CATEGORY_ID` | variable | Category ID for the posts (Posts → Categories, hover the category, read `tag_ID=`) |
| `WP_POST_STATUS` | env, optional | `publish` (default) or `draft` to review before it goes live |

If `WP_URL`, `WP_USER` or `WP_APP_PASS` is missing, the WordPress step is skipped. If a post with that week's slug already exists, it isn't posted twice. Set `WP_DRY_RUN=true` locally to print the post HTML without contacting WordPress.

If the email or WordPress step fails, the other still runs, the digest is still committed, and the run is marked as failed so GitHub notifies you.

### 6. Automate with GitHub Actions

1. Push this project to a new GitHub repo.
2. In the repo, go to **Settings → Secrets and variables → Actions** and add repository secrets for whichever variables you're using:
   - `RAINDROP_TOKEN`, `RAINDROP_COLLECTION_ID` (required)
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `EMAIL_FROM`, `EMAIL_TO` (optional, for email)
3. Done — [`.github/workflows/weekly-digest.yml`](.github/workflows/weekly-digest.yml) runs every Monday at 08:00 UTC, generates the digest, emails it and publishes to WordPress if configured, and commits it to `digests/` if there's new content. Trigger it manually anytime from the **Actions** tab via "Run workflow".

"Run workflow" has two optional inputs. **wordpress_only** publishes the blog post without writing a digest file or sending an email. **end_date** re-runs a past week, using that date as the end of the 7-day window. Together they backfill a missed post: for the week ending Monday 9 November 2026, tick wordpress_only and set end_date to `2026-11-09`.

## Configuration

Optional environment variables (set in `.env` locally, or as repo secrets for Actions):

| Variable | Default | Description |
| --- | --- | --- |
| `DIGEST_DAYS` | `7` | How many days back to look for links |
| `DIGEST_OUTPUT_DIR` | `digests` | Where generated files are written |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` / `EMAIL_FROM` / `EMAIL_TO` | _(unset)_ | Email delivery — see above. All six must be set for email to send. |

## Using the output in your static site

Each generated file has YAML front matter (`title`, `date`, `tags`) and a Markdown body, so it should work as-is with most SSGs:

- **Eleventy / Astro / Jekyll**: point a content collection at `digests/`, or copy/symlink files into your posts directory as part of your build.
- **Hugo**: same idea — the front matter is compatible with Hugo's default archetypes.
- **No SSG**: read the Markdown directly, or pipe it through any Markdown-to-HTML renderer.

## Customizing the digest format

- Edit `formatRaindrop` and `buildMarkdown` in [`src/generate-digest.js`](src/generate-digest.js) to change the Markdown file.
- Edit `buildDigestHtml` in [`src/email.js`](src/email.js) to change the emailed version.
