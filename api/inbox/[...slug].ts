import { NextRequest } from "next/server";

export const config = {
  runtime: "edge",
};

function base64urlToBase64(str: string) {
  const pad = str.length % 4;
  if (pad) str += "=".repeat(4 - pad);
  return str.replace(/-/g, "+").replace(/_/g, "/");
}

export default async function handler(req: NextRequest) {
  const slug = new URL(req.url).pathname.split("/").pop();
  if (!slug || !slug.includes("_")) {
    return new Response("Invalid slug", { status: 400 });
  }

  try {
    const encoded = slug.split("_")[1];
    const b64 = base64urlToBase64(encoded);
    const json = atob(b64);
    console.log("✅ Received payload:", json);
  } catch (err) {
    console.error("❌ Error decoding slug:", err);
    return new Response("Bad request", { status: 400 });
  }
