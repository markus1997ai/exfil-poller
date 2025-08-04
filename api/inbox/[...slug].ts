import { NextRequest } from "next/server";

export const config = {
  runtime: "edge",
};

function base64urlToBase64(input: string): string {
  return input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
}

export default async function handler(req: NextRequest) {
  const url = new URL(req.url);
  const slug = url.pathname.split("/").pop();

  if (!slug || !slug.includes("_")) {
    return new Response("Invalid slug", { status: 400 });
  }

  try {
    const b64url = slug.split("_").pop()!;
    const b64 = base64urlToBase64(b64url);
    const json = atob(b64);
    console.log("✅ Received payload:", json);
  } catch (err) {
    console.error("❌ Error decoding slug:", err);
    return new Response("Bad request", { status: 400 });
  }

  // Return dummy WOFF file so the browser completes the font load
  return new Response(new Uint8Array([0x77, 0x4f, 0x46, 0x46]), {
    headers: {
      "Content-Type": "font/woff",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
