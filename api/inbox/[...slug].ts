import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const slug = req.query.slug;
    const payload = Array.isArray(slug) ? slug.join('_') : slug;
    console.log('Received payload:', payload);

    res.setHeader('Content-Type', 'font/woff');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Minimal valid woff font file (dummy)
    const emptyWoff = Buffer.from([0x77, 0x4F, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]);
    res.status(200).send(emptyWoff);
  } catch (e) {
    console.error('Error:', e);
    res.status(500).send('Internal Server Error');
  }
}
