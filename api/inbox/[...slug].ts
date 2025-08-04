import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Extract slug parts (base64-encoded payload) from URL
    const slug = req.query.slug;
    const payload = Array.isArray(slug) ? slug.join('_') : slug;

    console.log('Received payload:', payload);

    // Set CORS headers to avoid CORS errors
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'font/woff');

    // Minimal valid WOFF font header (empty font) — 44 bytes buffer
    // Source: https://www.w3.org/TR/WOFF/#WOFFHeader
    const emptyWoff = Buffer.from([
      0x77, 0x4F, 0x46, 0x46, // Signature "wOFF"
      0x00, 0x00, 0x00, 0x00, // Flavor (0 for empty)
      0x00, 0x00, 0x00, 0x2C, // Length: 44 bytes total
      0x00, 0x01,             // NumTables: 1 (minimal)
      0x00, 0x00,             // Reserved
      0x00, 0x00,             // TotalSfntSize (set 0 for minimal)
      0x00, 0x00, 0x00, 0x00, // MajorVersion
      0x00, 0x00, 0x00, 0x00, // MinorVersion
      0x00, 0x00, 0x00, 0x00, // MetaOffset
      0x00, 0x00, 0x00, 0x00, // MetaLength
      0x00, 0x00, 0x00, 0x00, // MetaOrigLength
      0x00, 0x00, 0x00, 0x00, // PrivOffset
      0x00, 0x00, 0x00, 0x00, // PrivLength
      // Table directory (just placeholder zeros)
      0x00, 0x00, 0x00, 0x00, // Table tag
      0x00, 0x00, 0x00, 0x00, // Offset
      0x00, 0x00, 0x00, 0x00, // CompLength
      0x00, 0x00, 0x00, 0x00, // OrigLength
      0x00, 0x00, 0x00, 0x00, // Checksum
    ]);

    // Send response
    res.status(200).send(emptyWoff);
  } catch (e) {
    console.error('Error handling request:', e);
    res.status(500).send('Internal Server Error');
  }
}
