import type { VercelRequest, VercelResponse } from '@vercel/node';

// Minimal valid WOFF font binary (tiny font file)
const dummyFont = Buffer.from([
  119,79,70,70,0,0,0,54,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
]);

export default function handler(req: VercelRequest, res: VercelResponse) {
  console.log('Received payload:', req.query.slug);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'font/woff');

  res.status(200).send(dummyFont);
}
