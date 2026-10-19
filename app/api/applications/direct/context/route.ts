import { directApplicationContext } from "@/lib/public-journeys/handlers";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return directApplicationContext(request);
}