import { referredApplicationContext } from "@/lib/public-journeys/handlers";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> }
): Promise<Response> {
  const { code } = await context.params;
  return referredApplicationContext(request, code);
}