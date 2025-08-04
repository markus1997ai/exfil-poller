// /api/inbox/[slug].ts

import { NextRequest } from "next/server";

export const config = {
  runtime: "edge",
};

export default async function handler(req: NextRequest) {
  const { pathname } = new URL(req.url);
  const slug = pathname.split("/").pop();

  try {
    if (!slug) throw new Error("No slug provided");

    const b64 = slug.split("_").pop()!;
    const json = atob(b64);
    console.log("✅ Received payload:", json);
  } catch (err) {
    console.error("❌ Error decoding slug:", err);
  }

  return new Response("OK", {
    headers: {
      "Content-Type": "font/woff",
      "Access-Control-Allow-Origin": "*", // CORS fix
    },
  });
}
