import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const slug = req.query.slug;
    if (!slug) {
      res.status(400).send('Missing slug');
      return;
    }
    const segments = Array.isArray(slug) ? slug : [slug];
    // Remove ".woff" from the last segment
    segments[segments.length - 1] = segments[segments.length - 1].replace(/\.woff$/i, '');
    const payload = segments.join('_');

    console.log('Received payload:', payload);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'font/woff');

    const emptyWoff = Buffer.from([
      0x77, 0x4F, 0x46, 0x46,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x2C,
      0x00, 0x01,
      0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ]);

    res.status(200).send(emptyWoff);
  } catch {
    res.status(500).send('Error');
  }
}
