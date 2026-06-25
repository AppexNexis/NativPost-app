import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/libs/DB";
import { contentTemplateSchema } from "@/models/Schema";

/**
 * NativPost admin guard — same check as middleware + AdminShell.
 * Must be org:admin AND the org must be the NativPost team org.
 */
async function requireAdmin() {
  const { userId, orgId, orgRole } = await auth();

  if (!userId || !orgId) {
    return {
      error: NextResponse.json(
        { error: "Unauthorized — sign in and select an organization" },
        { status: 401 }
      ),
      orgId: null,
    };
  }

  const teamOrgId = process.env.NEXT_PUBLIC_NATIVPOST_TEAM_ORG_ID;
  const isNativPostStaff = !!(
    teamOrgId && orgId === teamOrgId && orgRole === "org:admin"
  );

  if (!isNativPostStaff) {
    return {
      error: NextResponse.json(
        { error: "Forbidden — NativPost admin access required" },
        { status: 403 }
      ),
      orgId: null,
    };
  }

  return { error: null, orgId };
}

// ── Input types ───────────────────────────────────────────────────────────

interface TemplateStructureInput {
  hook?: string;
  hookTime?: number;
  body?: string;
  bodyTime?: number;
  cta?: string;
  ctaTime?: number;
}

interface ImportTemplatePayload {
  sourceUrl: string;
  sourcePlatform: "tiktok" | "instagram" | "youtube" | "facebook" | "linkedin" | "twitter";
  contentType: "slideshow" | "wall_of_text" | "talking_head" | "green_screen_meme" | "video_hook_demo" | "carousel" | "ugc" | "custom";
  thumbnailUrl: string;
  creatorName?: string;
  niches?: string[];
  angles?: string[];
  engagementScore?: number;
  durationSeconds?: number;
  transcript?: string;
  structure?: TemplateStructureInput;
}

const VALID_PLATFORMS = [
  "tiktok",
  "instagram",
  "youtube",
  "facebook",
  "linkedin",
  "twitter",
];

const VALID_CONTENT_TYPES = [
  "slideshow",
  "wall_of_text",
  "talking_head",
  "green_screen_meme",
  "video_hook_demo",
  "carousel",
  "ugc",
  "custom",
];

function validateTemplate(
  t: ImportTemplatePayload
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!t.sourceUrl || typeof t.sourceUrl !== "string") {
    errors.push("sourceUrl is required");
  } else if (!t.sourceUrl.startsWith("http")) {
    errors.push("sourceUrl must be a valid URL");
  }

  if (!t.sourcePlatform) {
    errors.push("sourcePlatform is required");
  } else if (!VALID_PLATFORMS.includes(t.sourcePlatform)) {
    errors.push(
      `sourcePlatform must be one of: ${VALID_PLATFORMS.join(", ")}`
    );
  }

  if (!t.contentType) {
    errors.push("contentType is required");
  } else if (!VALID_CONTENT_TYPES.includes(t.contentType)) {
    errors.push(
      `contentType must be one of: ${VALID_CONTENT_TYPES.join(", ")}`
    );
  }

  if (!t.thumbnailUrl || typeof t.thumbnailUrl !== "string") {
    errors.push("thumbnailUrl is required");
  } else if (!t.thumbnailUrl.startsWith("http")) {
    errors.push("thumbnailUrl must be a valid URL");
  }

  if (
    t.engagementScore !== undefined &&
    (typeof t.engagementScore !== "number" ||
      t.engagementScore < 0 ||
      t.engagementScore > 1)
  ) {
    errors.push("engagementScore must be a number between 0 and 1");
  }

  if (
    t.durationSeconds !== undefined &&
    (typeof t.durationSeconds !== "number" || t.durationSeconds < 0)
  ) {
    errors.push("durationSeconds must be a non-negative number");
  }

  if (t.niches !== undefined && !Array.isArray(t.niches)) {
    errors.push("niches must be an array of strings");
  }

  if (t.angles !== undefined && !Array.isArray(t.angles)) {
    errors.push("angles must be an array of strings");
  }

  return { valid: errors.length === 0, errors };
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { error, orgId } = await requireAdmin();
  if (error) return error;

  const db = await getDb();

  try {
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
      const result = validateTemplate(t);
      if (result.valid) {
        validTemplates.push(t);
      } else {
        errors.push({ index, reason: result.errors.join("; ") });
      }
    });

    // Insert valid templates into the database
    const inserted = validTemplates.length > 0
      ? await db
          .insert(contentTemplateSchema)
          .values(
            validTemplates.map((t) => ({
              id: crypto.randomUUID(),
              orgId: orgId!,
              name: `Imported from ${t.sourcePlatform}`,
              description: t.transcript?.slice(0, 200) || null,
              contentType: t.contentType,
              sourcePlatform: t.sourcePlatform,
              sourceUrl: t.sourceUrl,
              sourceCreator: t.creatorName || null,
              thumbnailUrl: t.thumbnailUrl,
              mediaUrl: t.sourceUrl, // fallback for video URL
              durationSeconds: t.durationSeconds || null,
              niches: t.niches || [],
              angles: t.angles || [],
              contentStructure: t.structure
                ? {
                    hook: { text: t.structure.hook || "", timestamp: t.structure.hookTime || 0 },
                    body: { text: t.structure.body || "", timestamp: t.structure.bodyTime || 0 },
                    cta: { text: t.structure.cta || "", timestamp: t.structure.ctaTime || 0 },
                  }
                : {},
              engagementScore: t.engagementScore || null,
              likes: null,
              views: null,
              remixCount: 0,
              publishCount: 0,
              avgRemixPerformance: null,
              curationStatus: "pending" as const,
              isActive: true,
              curatedBy: null,
              curatedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            }))
          )
          .returning()
      : [];

    return NextResponse.json(
      {
        imported: inserted.length,
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