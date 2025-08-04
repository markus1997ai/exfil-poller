import { NextRequest } from "next/server";

export const config = {
  runtime: "edge",
};

// Use Buffer instead of atob to handle more cases
export default async function handler(req: NextRequest) {
  const slug = new URL(req.url).pathname.split("/").pop();
  if (!slug || !slug.includes("_")) {
    return new Response("Invalid slug", { status: 400 });
  }

  try {
    const encoded = slug.split("_")[1];
    const fixedB64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = fixedB64 + "=".repeat((4 - (fixedB64.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf-8");

    console.log("✅ Received payload:", json);
  } catch (err) {
    console.error("❌ Error decoding slug:", err);
    return new Response("Bad request", { status: 400 });
  }

  return new Response(new Uint8Array([0x77, 0x4f, 0x46, 0x46]), {
    headers: {
      "Content-Type": "font/woff",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
