"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Check,
  X,
  Star,
  Play,
  Search,
  Filter,
  TrendingUp,
  AlertTriangle,
  Copy,
  Clock,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  Zap,
  Instagram,
  Youtube,
  TikTok,
  Trash2,
  ArrowUpDown,
  Loader2,
} from "lucide-react";

/* ─────────────────── Types ─────────────────── */

type Platform = "TikTok" | "Instagram" | "YouTube";
type ContentType = "Video" | "Reel" | "Short" | "Long-form";
type CurationStatus = "pending" | "approved" | "rejected" | "featured";

interface TemplateStructure {
  hook: string;
  hookTime: number;
  body: string;
  bodyTime: number;
  cta: string;
  ctaTime: number;
}

interface Template {
  id: string;
  sourceUrl: string;
  sourcePlatform: Platform;
  contentType: ContentType;
  thumbnailUrl: string;
  creatorName: string;
  niches: string[];
  angles: string[];
  engagementScore: number | null;
  duration: number; // seconds
  status: CurationStatus;
  createdAt: string;
  updatedAt: string;
  transcript: string;
  structure: TemplateStructure;
  rejectionCount: number; // from this creator
  duplicateOf: string | null;
  featured: boolean;
}

/* ─────────────────── Mock Data ─────────────────── */

const MOCK_TEMPLATES: Template[] = [
  {
    id: "t-1",
    sourceUrl: "https://tiktok.com/@creator1/video/123",
    sourcePlatform: "TikTok",
    contentType: "Short",
    thumbnailUrl: "https://placehold.co/320x180/3b0764/ffffff?text=Hook+Template",
    creatorName: "@marketingmike",
    niches: ["SaaS", "B2B Marketing"],
    angles: ["Pain Point", "Social Proof"],
    engagementScore: 94,
    duration: 42,
    status: "pending",
    createdAt: "2024-05-20T08:00:00Z",
    updatedAt: "2024-05-20T08:00:00Z",
    transcript: "Are you tired of losing leads because your landing page sucks? Here's the 3-step formula top SaaS companies use to double conversion overnight. First, lead with the outcome—not the feature. Second, show a real customer result. Third, add a soft CTA like 'Try it free'.",
    structure: {
      hook: "Are you tired of losing leads because your landing page sucks?",
      hookTime: 0,
      body: "Here's the 3-step formula top SaaS companies use...",
      bodyTime: 8,
      cta: "Try it free",
      ctaTime: 35,
    },
    rejectionCount: 0,
    duplicateOf: null,
    featured: false,
  },
  {
    id: "t-2",
    sourceUrl: "https://instagram.com/reel/creator2/456",
    sourcePlatform: "Instagram",
    contentType: "Reel",
    thumbnailUrl: "https://placehold.co/320x180/0f172a/ffffff?text=Reel+Template",
    creatorName: "@sarahstartups",
    niches: ["E-commerce", "DTC"],
    angles: ["Before/After", "Tutorial"],
    engagementScore: 87,
    duration: 28,
    status: "pending",
    createdAt: "2024-05-20T09:15:00Z",
    updatedAt: "2024-05-20T09:15:00Z",
    transcript: "I grew this DTC brand from zero to $100K in 90 days. Step one: find a product with a wow factor. Step two: shoot raw UGC, not polished ads. Step three: run TikTok spark ads with creators who actually use the product.",
    structure: {
      hook: "I grew this DTC brand from zero to $100K in 90 days.",
      hookTime: 0,
      body: "Step one: find a product with a wow factor...",
      bodyTime: 5,
      cta: "Follow for more growth tactics",
      ctaTime: 22,
    },
    rejectionCount: 1,
    duplicateOf: null,
    featured: false,
  },
  {
    id: "t-3",
    sourceUrl: "https://youtube.com/shorts/creator3/789",
    sourcePlatform: "YouTube",
    contentType: "Short",
    thumbnailUrl: "https://placehold.co/320x180/7f1d1d/ffffff?text=Short+Template",
    creatorName: "@growthguru",
    niches: ["Personal Brand", "Coaching"],
    angles: ["Myth Busting", "Storytelling"],
    engagementScore: 72,
    duration: 55,
    status: "pending",
    createdAt: "2024-05-19T14:30:00Z",
    updatedAt: "2024-05-19T14:30:00Z",
    transcript: "The biggest myth in personal branding is that you need to post every day. The truth? One high-quality post per week beats seven mediocre ones. Here's the proof...",
    structure: {
      hook: "The biggest myth in personal branding is that you need to post every day.",
      hookTime: 0,
      body: "The truth? One high-quality post per week beats seven mediocre ones...",
      bodyTime: 10,
      cta: "Download my free content calendar",
      ctaTime: 48,
    },
    rejectionCount: 3,
    duplicateOf: null,
    featured: false,
  },
  {
    id: "t-4",
    sourceUrl: "https://tiktok.com/@creator4/video/321",
    sourcePlatform: "TikTok",
    contentType: "Video",
    thumbnailUrl: "https://placehold.co/320x180/1e3a5f/ffffff?text=Video+Template",
    creatorName: "@adwizard",
    niches: ["Paid Ads", "Facebook"],
    angles: ["A/B Test Reveal", "Data-Driven"],
    engagementScore: 96,
    duration: 38,
    status: "pending",
    createdAt: "2024-05-19T11:00:00Z",
    updatedAt: "2024-05-19T11:00:00Z",
    transcript: "We tested 47 ad creatives. The winner? A simple iPhone screen recording with no music and no transitions. Cost per lead dropped by 62%. Here's why it works...",
    structure: {
      hook: "We tested 47 ad creatives. The winner?",
      hookTime: 0,
      body: "A simple iPhone screen recording with no music...",
      bodyTime: 6,
      cta: "Get our full creative brief template",
      ctaTime: 30,
    },
    rejectionCount: 0,
    duplicateOf: null,
    featured: false,
  },
  {
    id: "t-5",
    sourceUrl: "https://instagram.com/reel/creator5/654",
    sourcePlatform: "Instagram",
    contentType: "Reel",
    thumbnailUrl: "https://placehold.co/320x180/14532d/ffffff?text=Reel+Template+2",
    creatorName: "@copyqueen",
    niches: ["Copywriting", "Email Marketing"],
    angles: ["Listicle", "Hack"],
    engagementScore: 81,
    duration: 33,
    status: "pending",
    createdAt: "2024-05-18T16:45:00Z",
    updatedAt: "2024-05-18T16:45:00Z",
    transcript: "5 email subject lines that got me a 60% open rate. Number 3 is controversial. One: 'You forgot something.' Two: 'Bad news, [name].' Three: 'I was wrong about...'",
    structure: {
      hook: "5 email subject lines that got me a 60% open rate. Number 3 is controversial.",
      hookTime: 0,
      body: "One: 'You forgot something.' Two: 'Bad news, [name].'...",
      bodyTime: 5,
      cta: "Save this for your next campaign",
      ctaTime: 28,
    },
    rejectionCount: 0,
    duplicateOf: "t-2",
    featured: false,
  },
  {
    id: "t-6",
    sourceUrl: "https://youtube.com/shorts/creator6/987",
    sourcePlatform: "YouTube",
    contentType: "Short",
    thumbnailUrl: "https://placehold.co/320x180/431407/ffffff?text=Short+Template+2",
    creatorName: "@funnelhack",
    niches: ["Sales Funnels", "ClickFunnels"],
    angles: ["Case Study", "Revenue Reveal"],
    engagementScore: 58,
    duration: 45,
    status: "pending",
    createdAt: "2024-05-18T10:20:00Z",
    updatedAt: "2024-05-18T10:20:00Z",
    transcript: "This funnel did $2.3M in 6 months. The secret was a single order bump on the checkout page. Most people skip this. Here's the exact script we used...",
    structure: {
      hook: "This funnel did $2.3M in 6 months. The secret was a single order bump.",
      hookTime: 0,
      body: "Most people skip this. Here's the exact script we used...",
      bodyTime: 12,
      cta: "Get the funnel template in bio",
      ctaTime: 38,
    },
    rejectionCount: 2,
    duplicateOf: null,
    featured: false,
  },
  {
    id: "t-7",
    sourceUrl: "https://tiktok.com/@creator7/video/111",
    sourcePlatform: "TikTok",
    contentType: "Short",
    thumbnailUrl: "https://placehold.co/320x180/581c87/ffffff?text=TikTok+Template",
    creatorName: "@seo_sam",
    niches: ["SEO", "Content Marketing"],
    angles: ["Myth Busting", "Quick Win"],
    engagementScore: 91,
    duration: 36,
    status: "pending",
    createdAt: "2024-05-17T13:10:00Z",
    updatedAt: "2024-05-17T13:10:00Z",
    transcript: "Stop doing keyword research. Instead, find what already ranks on page two of Google, make it 10x better, and steal the traffic. I call it the 'page two hack'.",
    structure: {
      hook: "Stop doing keyword research.",
      hookTime: 0,
      body: "Instead, find what already ranks on page two...",
      bodyTime: 4,
      cta: "Comment 'HACK' for the full SOP",
      ctaTime: 30,
    },
    rejectionCount: 0,
    duplicateOf: null,
    featured: false,
  },
  {
    id: "t-8",
    sourceUrl: "https://instagram.com/reel/creator8/222",
    sourcePlatform: "Instagram",
    contentType: "Reel",
    thumbnailUrl: "https://placehold.co/320x180/134e4a/ffffff?text=Reel+Template+3",
    creatorName: "@brandboss",
    niches: ["Branding", "Design"],
    angles: ["Before/After", "Transformation"],
    engagementScore: 76,
    duration: 30,
    status: "pending",
    createdAt: "2024-05-17T09:00:00Z",
    updatedAt: "2024-05-17T09:00:00Z",
    transcript: "This brand refresh increased perceived value by 300%. The only thing we changed? The color palette. Here's the psychology behind each color choice...",
    structure: {
      hook: "This brand refresh increased perceived value by 300%.",
      hookTime: 0,
      body: "The only thing we changed? The color palette...",
      bodyTime: 7,
      cta: "Book a free brand audit",
      ctaTime: 25,
    },
    rejectionCount: 1,
    duplicateOf: null,
    featured: false,
  },
  {
    id: "t-9",
    sourceUrl: "https://youtube.com/shorts/creator9/333",
    sourcePlatform: "YouTube",
    contentType: "Long-form",
    thumbnailUrl: "https://placehold.co/320x180/312e81/ffffff?text=Long+Template",
    creatorName: "@team_tactics",
    niches: ["Leadership", "Team Management"],
    angles: ["Storytelling", "Lessons Learned"],
    engagementScore: 65,
    duration: 180,
    status: "pending",
    createdAt: "2024-05-16T15:30:00Z",
    updatedAt: "2024-05-16T15:30:00Z",
    transcript: "I fired my top salesperson. Revenue dropped 40% that quarter. But here's what happened next—and why it was the best decision I ever made...",
    structure: {
      hook: "I fired my top salesperson. Revenue dropped 40% that quarter.",
      hookTime: 0,
      body: "But here's what happened next—and why it was the best decision...",
      bodyTime: 15,
      cta: "Subscribe for weekly leadership insights",
      ctaTime: 170,
    },
    rejectionCount: 0,
    duplicateOf: null,
    featured: false,
  },
  {
    id: "t-10",
    sourceUrl: "https://tiktok.com/@creator10/video/444",
    sourcePlatform: "TikTok",
    contentType: "Short",
    thumbnailUrl: "https://placehold.co/320x180/4c1d95/ffffff?text=TikTok+Template+2",
    creatorName: "@growthguru",
    niches: ["Personal Brand", "LinkedIn"],
    angles: ["Contrarian Take", "Listicle"],
    engagementScore: 83,
    duration: 40,
    status: "pending",
    createdAt: "2024-05-16T11:20:00Z",
    updatedAt: "2024-05-16T11:20:00Z",
    transcript: "LinkedIn is not a social network. It's a search engine. Treat your profile like an SEO asset and watch inbound leads flow in. Here's the exact headline formula...",
    structure: {
      hook: "LinkedIn is not a social network. It's a search engine.",
      hookTime: 0,
      body: "Treat your profile like an SEO asset...",
      bodyTime: 8,
      cta: "Optimize your profile with my free guide",
      ctaTime: 33,
    },
    rejectionCount: 3,
    duplicateOf: null,
    featured: false,
  },
];

/* ─────────────────── Helpers ─────────────────── */

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const PlatformIcon = ({ platform }: { platform: Platform }) => {
  switch (platform) {
    case "TikTok":
      return <TikTok className="h-4 w-4" />;
    case "Instagram":
      return <Instagram className="h-4 w-4" />;
    case "YouTube":
      return <Youtube className="h-4 w-4" />;
    default:
      return null;
  }
};

const ContentBadge = ({ type }: { type: ContentType }) => {
  const colorMap: Record<ContentType, string> = {
    Video: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    Reel: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
    Short: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    "Long-form": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  };
  return (
    <Badge variant="outline" className={colorMap[type]}>
      {type}
    </Badge>
  );
};

const SuggestionBanner = ({ template }: { template: Template }) => {
  if (template.engagementScore && template.engagementScore >= 90) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300">
        <Zap className="h-4 w-4" />
        High engagement score ({template.engagementScore}) → Auto-suggest Approve
      </div>
    );
  }
  if (template.rejectionCount >= 3) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
        <AlertTriangle className="h-4 w-4" />
        Creator has {template.rejectionCount} rejections → Flag for review
      </div>
    );
  }
  if (template.duplicateOf) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
        <Copy className="h-4 w-4" />
        Duplicate content detected → Similar to template #{template.duplicateOf}
      </div>
    );
  }
  return null;
};

/* ─────────────────── Main Component ─────────────────── */

export default function CurationQueue() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>(MOCK_TEMPLATES);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerTemplate, setDrawerTemplate] = useState<Template | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPlatform, setFilterPlatform] = useState<"all" | Platform>("all");
  const [filterType, setFilterType] = useState<"all" | ContentType>("all");
  const [filterNiche, setFilterNiche] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date" | "engagement">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [editNiches, setEditNiches] = useState<string[]>([]);
  const [editAngles, setEditAngles] = useState<string[]>([]);
  const [newNiche, setNewNiche] = useState("");
  const [newAngle, setNewAngle] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const allNiches = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((t) => t.niches.forEach((n) => set.add(n)));
    return Array.from(set).sort();
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    let result = templates.filter((t) => t.status === "pending");
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.creatorName.toLowerCase().includes(q) ||
          t.sourceUrl.toLowerCase().includes(q)
      );
    }
    if (filterPlatform !== "all") {
      result = result.filter((t) => t.sourcePlatform === filterPlatform);
    }
    if (filterType !== "all") {
      result = result.filter((t) => t.contentType === filterType);
    }
    if (filterNiche !== "all") {
      result = result.filter((t) => t.niches.includes(filterNiche));
    }
    result.sort((a, b) => {
      if (sortBy === "engagement") {
        const ae = a.engagementScore ?? 0;
        const be = b.engagementScore ?? 0;
        return sortDir === "asc" ? ae - be : be - ae;
      }
      const ad = new Date(a.createdAt).getTime();
      const bd = new Date(b.createdAt).getTime();
      return sortDir === "asc" ? ad - bd : bd - ad;
    });
    return result;
  }, [templates, searchQuery, filterPlatform, filterType, filterNiche, sortBy, sortDir]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const approvedToday = templates.filter(
      (t) => t.status === "approved" && t.updatedAt.startsWith(today)
    ).length;
    const rejectedToday = templates.filter(
      (t) => t.status === "rejected" && t.updatedAt.startsWith(today)
    ).length;
    const pending = templates.filter((t) => t.status === "pending").length;
    return { pending, approvedToday, rejectedToday };
  }, [templates]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredTemplates.length && filteredTemplates.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTemplates.map((t) => t.id)));
    }
  };

  const updateStatus = async (ids: string[], status: CurationStatus) => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    setTemplates((prev) =>
      prev.map((t) =>
        ids.includes(t.id)
          ? { ...t, status, updatedAt: new Date().toISOString(), featured: status === "featured" }
          : t
      )
    );
    setSelectedIds(new Set());
    setIsLoading(false);
    if (drawerTemplate && ids.includes(drawerTemplate.id)) {
      setDrawerTemplate(null);
    }
  };

  const openDrawer = (t: Template) => {
    setDrawerTemplate(t);
    setEditNiches([...t.niches]);
    setEditAngles([...t.angles]);
    setRejectFeedback("");
  };

  const addTag = (
    val: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    inputSetter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    setter((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    inputSetter("");
  };

  const removeTag = (
    tag: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter((prev) => prev.filter((t) => t !== tag));
  };

  const handleApproveWithEdits = async () => {
    if (!drawerTemplate) return;
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === drawerTemplate.id
          ? {
              ...t,
              niches: editNiches,
              angles: editAngles,
              status: "approved",
              updatedAt: new Date().toISOString(),
            }
          : t
      )
    );
    setDrawerTemplate(null);
    setIsLoading(false);
  };

  const handleRejectWithFeedback = async () => {
    if (!drawerTemplate) return;
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === drawerTemplate.id
          ? {
              ...t,
              status: "rejected",
              updatedAt: new Date().toISOString(),
            }
          : t
      )
    );
    // In real app, send feedback to API
    console.log("Reject feedback:", rejectFeedback);
    setDrawerTemplate(null);
    setIsLoading(false);
  };

  const toggleSort = (field: "date" | "engagement") => {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
  };

  /* ─────────────────── Render ─────────────────── */

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
              <p className="text-xs text-muted-foreground">In queue</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approved Today</CardTitle>
              <ThumbsUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.approvedToday}</div>
              <p className="text-xs text-muted-foreground">Published</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rejected Today</CardTitle>
              <ThumbsDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.rejectedToday}</div>
              <p className="text-xs text-muted-foreground">Declined</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters & Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by creator or source URL..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={filterPlatform}
                  onValueChange={(v) => setFilterPlatform(v as Platform | "all")}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    <SelectItem value="TikTok">TikTok</SelectItem>
                    <SelectItem value="Instagram">Instagram</SelectItem>
                    <SelectItem value="YouTube">YouTube</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={filterType}
                  onValueChange={(v) => setFilterType(v as ContentType | "all")}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Content Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="Video">Video</SelectItem>
                    <SelectItem value="Reel">Reel</SelectItem>
                    <SelectItem value="Short">Short</SelectItem>
                    <SelectItem value="Long-form">Long-form</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterNiche} onValueChange={setFilterNiche}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Niche" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Niches</SelectItem>
                    {allNiches.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFilterPlatform("all");
                    setFilterType("all");
                    setFilterNiche("all");
                    setSearchQuery("");
                  }}
                >
                  <Filter className="mr-1 h-3 w-3" />
                  Reset
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-4 py-2">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button
              size="sm"
              variant="default"
              disabled={isLoading}
              onClick={() => updateStatus(Array.from(selectedIds), "approved")}
            >
              <Check className="mr-1 h-3 w-3" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isLoading}
              onClick={() => updateStatus(Array.from(selectedIds), "rejected")}
            >
              <X className="mr-1 h-3 w-3" />
              Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isLoading}
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
        )}

        {/* Template Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={
                          filteredTemplates.length > 0 &&
                          selectedIds.size === filteredTemplates.length
                        }
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-[80px]">Preview</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Creator</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Niches</TableHead>
                    <TableHead>Angles</TableHead>
                    <TableHead
                      className="cursor-pointer"
                      onClick={() => toggleSort("engagement")}
                    >
                      <div className="flex items-center gap-1">
                        Engagement
                        {sortBy === "engagement" &&
                          (sortDir === "asc" ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          ))}
                        {sortBy !== "engagement" && <ArrowUpDown className="h-3 w-3" />}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer"
                      onClick={() => toggleSort("date")}
                    >
                      <div className="flex items-center gap-1">
                        Duration
                        {sortBy === "date" &&
                          (sortDir === "asc" ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          ))}
                        {sortBy !== "date" && <ArrowUpDown className="h-3 w-3" />}
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTemplates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                        No pending templates match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTemplates.map((template) => (
                      <TableRow key={template.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(template.id)}
                            onCheckedChange={() => toggleSelect(template.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => setPreviewTemplate(template)}
                            className="relative block overflow-hidden rounded-md"
                          >
                            <img
                              src={template.thumbnailUrl}
                              alt="thumbnail"
                              className="h-12 w-20 object-cover"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition hover:opacity-100">
                              <Play className="h-4 w-4 text-white" />
                            </div>
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <PlatformIcon platform={template.sourcePlatform} />
                            <span className="text-sm">{template.sourcePlatform}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => openDrawer(template)}
                            className="font-medium text-primary hover:underline"
                          >
                            {template.creatorName}
                          </button>
                          <SuggestionBanner template={template} />
                        </TableCell>
                        <TableCell>
                          <ContentBadge type={template.contentType} />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {template.niches.map((n) => (
                              <Badge key={n} variant="secondary" className="text-xs">
                                {n}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {template.angles.map((a) => (
                              <Badge key={a} variant="outline" className="text-xs">
                                {a}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {template.engagementScore ? (
                            <div className="flex items-center gap-1">
                              <TrendingUp className="h-3 w-3 text-green-600" />
                              <span className="font-medium">{template.engagementScore}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{formatDuration(template.duration)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-green-600 hover:bg-green-50 hover:text-green-700"
                              disabled={isLoading}
                              onClick={() => updateStatus([template.id], "approved")}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-red-600 hover:bg-red-50 hover:text-red-700"
                              disabled={isLoading}
                              onClick={() => updateStatus([template.id], "rejected")}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                              disabled={isLoading}
                              onClick={() => updateStatus([template.id], "featured")}
                            >
                              <Star className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Video Preview Dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Video Preview</DialogTitle>
            <DialogDescription>
              {previewTemplate?.creatorName} — {previewTemplate?.contentType}
            </DialogDescription>
          </DialogHeader>
          <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
            {previewTemplate && (
              <video
                controls
                poster={previewTemplate.thumbnailUrl}
                className="h-full w-full"
                src={previewTemplate.sourceUrl} // In real app, this would be a playable video URL
              />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {previewTemplate?.niches.map((n) => (
              <Badge key={n} variant="secondary">
                {n}
              </Badge>
            ))}
            {previewTemplate?.angles.map((a) => (
              <Badge key={a} variant="outline">
                {a}
              </Badge>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Drawer */}
      <Drawer open={!!drawerTemplate} onOpenChange={() => setDrawerTemplate(null)}>
        <DrawerContent className="max-h-[90vh]">
          {drawerTemplate && (
            <>
              <DrawerHeader>
                <DrawerTitle className="flex items-center gap-2">
                  <PlatformIcon platform={drawerTemplate.sourcePlatform} />
                  {drawerTemplate.creatorName}
                </DrawerTitle>
                <DrawerDescription>{drawerTemplate.sourceUrl}</DrawerDescription>
              </DrawerHeader>

              <div className="px-4 pb-2">
                <SuggestionBanner template={drawerTemplate} />
              </div>

              <div className="overflow-y-auto px-4">
                <Tabs defaultValue="preview">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="preview">Video Preview</TabsTrigger>
                    <TabsTrigger value="structure">Structure</TabsTrigger>
                    <TabsTrigger value="tags">Tags & Edit</TabsTrigger>
                  </TabsList>

                  <TabsContent value="preview" className="space-y-4">
                    <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
                      <video
                        controls
                        poster={drawerTemplate.thumbnailUrl}
                        className="h-full w-full"
                        src={drawerTemplate.sourceUrl}
                      />
                    </div>
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Transcript</p>
                      <p className="mt-1 text-sm leading-relaxed">{drawerTemplate.transcript}</p>
                    </div>
                  </TabsContent>

                  <TabsContent value="structure" className="space-y-4">
                    <div className="space-y-3">
                      <div className="rounded-md border-l-4 border-green-500 bg-green-50 p-3 dark:bg-green-900/20">
                        <p className="text-xs font-semibold uppercase text-green-700 dark:text-green-300">
                          Hook ({drawerTemplate.structure.hookTime}s)
                        </p>
                        <p className="mt-1 text-sm">{drawerTemplate.structure.hook}</p>
                      </div>
                      <div className="rounded-md border-l-4 border-blue-500 bg-blue-50 p-3 dark:bg-blue-900/20">
                        <p className="text-xs font-semibold uppercase text-blue-700 dark:text-blue-300">
                          Body ({drawerTemplate.structure.bodyTime}s)
                        </p>
                        <p className="mt-1 text-sm">{drawerTemplate.structure.body}</p>
                      </div>
                      <div className="rounded-md border-l-4 border-purple-500 bg-purple-50 p-3 dark:bg-purple-900/20">
                        <p className="text-xs font-semibold uppercase text-purple-700 dark:text-purple-300">
                          CTA ({drawerTemplate.structure.ctaTime}s)
                        </p>
                        <p className="mt-1 text-sm">{drawerTemplate.structure.cta}</p>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="tags" className="space-y-4">
                    <div>
                      <p className="mb-2 text-sm font-medium">Niches</p>
                      <div className="flex flex-wrap gap-2">
                        {editNiches.map((n) => (
                          <Badge key={n} variant="secondary" className="gap-1">
                            {n}
                            <button
                              onClick={() => removeTag(n, setEditNiches)}
                              className="ml-1 rounded-full hover:bg-destructive/20"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Input
                          placeholder="Add niche..."
                          value={newNiche}
                          onChange={(e) => setNewNiche(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addTag(newNiche, setEditNiches, setNewNiche);
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => addTag(newNiche, setEditNiches, setNewNiche)}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-medium">Angles</p>
                      <div className="flex flex-wrap gap-2">
                        {editAngles.map((a) => (
                          <Badge key={a} variant="outline" className="gap-1">
                            {a}
                            <button
                              onClick={() => removeTag(a, setEditAngles)}
                              className="ml-1 rounded-full hover:bg-destructive/20"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Input
                          placeholder="Add angle..."
                          value={newAngle}
                          onChange={(e) => setNewAngle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addTag(newAngle, setEditAngles, setNewAngle);
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => addTag(newAngle, setEditAngles, setNewAngle)}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                {/* Reject Feedback */}
                <div className="mt-4">
                  <p className="mb-2 text-sm font-medium">Rejection Feedback (optional)</p>
                  <Textarea
                    placeholder="Why is this being rejected?"
                    value={rejectFeedback}
                    onChange={(e) => setRejectFeedback(e.target.value)}
                  />
                </div>
              </div>

              <DrawerFooter className="flex-row justify-end gap-2">
                <DrawerClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DrawerClose>
                <Button
                  variant="destructive"
                  disabled={isLoading}
                  onClick={handleRejectWithFeedback}
                >
                  {isLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <X className="mr-1 h-4 w-4" />}
                  Reject with Feedback
                </Button>
                <Button
                  variant="default"
                  disabled={isLoading}
                  onClick={handleApproveWithEdits}
                >
                  {isLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
                  Approve with Edits
                </Button>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </AdminLayout>
  );
}
