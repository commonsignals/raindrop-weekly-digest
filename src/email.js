import nodemailer from 'nodemailer';

const REQUIRED_VARS = ['SMTP_HOST', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'EMAIL_FROM', 'EMAIL_TO'];

function escapeHtml(str = '') {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str = '') {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

export function buildDigestHtml(items, dateRange) {
  const rows = items
    .map((item) => {
      const title = escapeHtml(item.title?.trim() || item.link);
      const excerpt = item.excerpt?.trim()
        ? `<p style="margin:4px 0 0;color:#555;font-size:14px;line-height:1.4;">${escapeHtml(item.excerpt)}</p>`
        : '';
      const tags = item.tags?.length
        ? `<p style="margin:4px 0 0;color:#888;font-size:12px;">${item.tags.map(escapeHtml).join(', ')}</p>`
        : '';
      return `<li style="margin-bottom:18px;">
        <a href="${escapeAttr(item.link)}" style="font-size:16px;font-weight:600;color:#1a56db;text-decoration:none;">${title}</a>
        ${excerpt}${tags}
      </li>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html>
  <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
    <h1 style="font-size:20px;margin:0 0 20px;">Weekly Links — ${dateRange}</h1>
    <ul style="list-style:none;padding:0;margin:0;">${rows}</ul>
    <p style="color:#888;font-size:13px;margin-top:24px;">${items.length} link${items.length === 1 ? '' : 's'} saved to Raindrop.io this week.</p>
  </body>
</html>`;
}

export async function sendDigestEmail({ subject, html }) {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length) {
    console.log(`Skipping email — missing environment variable(s): ${missing.join(', ')}`);
    return false;
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, EMAIL_FROM, EMAIL_TO } = process.env;
  const port = Number(SMTP_PORT ?? 587);

  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USERNAME, pass: SMTP_PASSWORD },
  });

  await transport.sendMail({ from: EMAIL_FROM, to: EMAIL_TO, subject, html });
  console.log(`Emailed digest to ${EMAIL_TO}`);
  return true;
}
