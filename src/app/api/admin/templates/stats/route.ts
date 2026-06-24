import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || [
  "admin@nativpost.com",
];

async function isAdmin(req: NextRequest): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session")?.value;
  const authHeader = req.headers.get("Authorization");
  const bearerToken = authHeader?.replace("Bearer ", "");

  // In production, verify the session token against your auth service
  // and check the user's role or email against ADMIN_EMAILS
  // Example:
  // const user = await getUserFromSession(sessionToken);
  // return user && (ADMIN_EMAILS.includes(user.email) || user.role === "admin");

  return true;
}

export async function GET(req: NextRequest) {
  try {
    if (!(await isAdmin(req))) {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      );
    }

    // In production, query your database for real metrics
    // Example with Drizzle/Prisma:
    // const today = new Date();
    // today.setHours(0, 0, 0, 0);
    // const todayProcessed = await db
    //   .select({ count: count() })
    //   .from(contentTemplateSchema)
    //   .where(gte(contentTemplateSchema.updatedAt, today));

    const metrics = {
      today: {
        processed: 58,
        approved: 45,
        rejected: 13,
      },
      thisWeek: {
        processed: 312,
        approved: 245,
        rejected: 67,
      },
      thisMonth: {
        processed: 1240,
        approved: 980,
        rejected: 260,
      },
      avgTimeInQueue: 4.2,
      oldestPending: 18.5,
      avgQueueLength: 23,
      velocity: [
        { day: "Mon", processed: 42 },
        { day: "Tue", processed: 58 },
        { day: "Wed", processed: 65 },
        { day: "Thu", processed: 48 },
        { day: "Fri", processed: 72 },
        { day: "Sat", processed: 38 },
        { day: "Sun", processed: 31 },
      ],
      topNiches: [
        { name: "SaaS", count: 156 },
        { name: "E-commerce", count: 134 },
        { name: "Personal Brand", count: 112 },
        { name: "Paid Ads", count: 98 },
        { name: "SEO", count: 87 },
        { name: "Copywriting", count: 76 },
        { name: "Email Marketing", count: 65 },
        { name: "Branding", count: 54 },
      ],
      topAngles: [
        { name: "Pain Point", count: 203 },
        { name: "Social Proof", count: 178 },
        { name: "Tutorial", count: 156 },
        { name: "Before/After", count: 134 },
        { name: "Myth Busting", count: 122 },
        { name: "Storytelling", count: 109 },
        { name: "Listicle", count: 98 },
        { name: "Hack", count: 87 },
      ],
      approvalRateHistory: [
        { week: "W1", rate: 78 },
        { week: "W2", rate: 82 },
        { week: "W3", rate: 75 },
        { week: "W4", rate: 79 },
      ],
      platformBreakdown: [
        { name: "TikTok", value: 540, color: "#0f172a" },
        { name: "Instagram", value: 420, color: "#e11d48" },
        { name: "YouTube", value: 280, color: "#ef4444" },
      ],
    };

    return NextResponse.json(metrics, { status: 200 });
  } catch (err) {
    console.error("Stats API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
