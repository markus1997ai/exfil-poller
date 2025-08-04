import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const dummyFontData = Buffer.from([
    0x00, 0x01, 0x00, 0x00, // minimal valid woff header bytes (dummy)
    0x00, 0x10, 0x00, 0x80,
  ]);

  res.setHeader('Content-Type', 'font/woff');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(dummyFontData);
}
