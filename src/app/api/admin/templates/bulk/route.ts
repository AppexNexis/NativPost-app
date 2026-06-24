import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || [
  "admin@nativpost.com",
];

interface TemplateStructure {
  hook: string;
  hookTime: number;
  body: string;
  bodyTime: number;
  cta: string;
  ctaTime: number;
}

interface ImportTemplatePayload {
  sourceUrl: string;
  sourcePlatform: "TikTok" | "Instagram" | "YouTube";
  contentType: "Video" | "Reel" | "Short" | "Long-form";
  thumbnailUrl: string;
  creatorName?: string;
  niches?: string[];
  angles?: string[];
  engagementScore?: number;
  duration?: number;
  transcript?: string;
  structure?: TemplateStructure;
}

async function isAdmin(req: NextRequest): Promise<boolean> {
  // Check session token from cookies or Authorization header
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session")?.value;

  // In production, verify the session token against your auth service
  // and check the user's role or email against ADMIN_EMAILS
  const authHeader = req.headers.get("Authorization");
  const bearerToken = authHeader?.replace("Bearer ", "");

  // Mock admin check for demo
  return true;
}

function validateTemplate(
  t: ImportTemplatePayload,
  index: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!t.sourceUrl || typeof t.sourceUrl !== "string") {
    errors.push("sourceUrl is required and must be a string");
  } else if (!t.sourceUrl.startsWith("http")) {
    errors.push("sourceUrl must be a valid URL");
  }

  if (!t.sourcePlatform) {
    errors.push("sourcePlatform is required");
  } else if (!["TikTok", "Instagram", "YouTube"].includes(t.sourcePlatform)) {
    errors.push("sourcePlatform must be TikTok, Instagram, or YouTube");
  }

  if (!t.contentType) {
    errors.push("contentType is required");
  } else if (!["Video", "Reel", "Short", "Long-form"].includes(t.contentType)) {
    errors.push("contentType must be Video, Reel, Short, or Long-form");
  }

  if (!t.thumbnailUrl || typeof t.thumbnailUrl !== "string") {
    errors.push("thumbnailUrl is required and must be a string");
  } else if (!t.thumbnailUrl.startsWith("http")) {
    errors.push("thumbnailUrl must be a valid URL");
  }

  if (t.engagementScore !== undefined && (typeof t.engagementScore !== "number" || t.engagementScore < 0 || t.engagementScore > 100)) {
    errors.push("engagementScore must be a number between 0 and 100");
  }

  if (t.duration !== undefined && (typeof t.duration !== "number" || t.duration < 0)) {
    errors.push("duration must be a non-negative number");
  }

  if (t.niches !== undefined && !Array.isArray(t.niches)) {
    errors.push("niches must be an array of strings");
  }

  if (t.angles !== undefined && !Array.isArray(t.angles)) {
    errors.push("angles must be an array of strings");
  }

  return { valid: errors.length === 0, errors };
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isAdmin(req))) {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { templates } = body as { templates: ImportTemplatePayload[] };

    if (!Array.isArray(templates)) {
      return NextResponse.json(
        { error: "Invalid request: templates must be an array" },
        { status: 400 }
      );
    }

    if (templates.length === 0) {
      return NextResponse.json(
        { error: "Invalid request: templates array is empty" },
        { status: 400 }
      );
    }

    if (templates.length > 1000) {
      return NextResponse.json(
        { error: "Invalid request: maximum 1000 templates per batch" },
        { status: 400 }
      );
    }

    const errors: Array<{ index: number; reason: string }> = [];
    const validTemplates: ImportTemplatePayload[] = [];

    templates.forEach((t, index) => {
      const result = validateTemplate(t, index);
      if (result.valid) {
        validTemplates.push(t);
      } else {
        errors.push({ index, reason: result.errors.join("; ") });
      }
    });

    // In production, insert into database using your ORM
    // Example with Drizzle/Prisma:
    // const inserted = await db.insert(contentTemplateSchema).values(
    //   validTemplates.map(t => ({
    //     id: generateId(),
    //     ...t,
    //     status: "pending",
    //     createdAt: new Date(),
    //     updatedAt: new Date(),
    //   }))
    // ).returning();

    // Mock insertion for demo
    const mockInserted = validTemplates.map((t) => ({
      id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...t,
      status: "pending" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    return NextResponse.json(
      {
        imported: mockInserted.length,
        errors,
        total: templates.length,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Bulk import error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
