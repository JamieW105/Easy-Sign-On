import { loadClubIcon } from "@/lib/server/clubIcon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const icon = await loadClubIcon();

  if (!icon) {
    return new Response(null, { status: 204 });
  }

  return new Response(Buffer.from(icon.data, "base64"), {
    headers: {
      "Content-Type": icon.contentType,
      "Cache-Control": "no-store",
    },
  });
}
