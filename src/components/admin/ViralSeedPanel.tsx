"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sprout, AlertCircle, CheckCircle2 } from "lucide-react";
import type { SourcePlatform } from "@/lib/template-seed/types";

type SeedOptionKey =
  | "pexels"
  | "youtube"
  | "tiktok-research"
  | "instagram"
  | "tiktok-creative-center";

interface SeedOption {
  key: SeedOptionKey;
  source: SourcePlatform;
  label: string;
  experimental?: boolean;
}

const SEED_OPTIONS: SeedOption[] = [
  { key: "pexels", source: "pexels", label: "Pexels" },
  { key: "youtube", source: "youtube", label: "YouTube" },
  { key: "tiktok-research", source: "tiktok", label: "TikTok Research" },
  { key: "instagram", source: "instagram", label: "Instagram" },
  {
    key: "tiktok-creative-center",
    source: "tiktok",
    label: "TikTok Creative Center",
    experimental: true,
  },
];

const DEFAULT_SELECTED: Record<SeedOptionKey, boolean> = {
  pexels: false,
  youtube: false,
  "tiktok-research": false,
  instagram: false,
  "tiktok-creative-center": false,
};

export default function ViralSeedPanel() {
  const [selected, setSelected] = useState<Record<SeedOptionKey, boolean>>(DEFAULT_SELECTED);
  const [limit, setLimit] = useState<number>(20);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ seeded: number; errors?: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedCount = Object.values(selected).filter(Boolean).length;

  const toggleOption = (key: SeedOptionKey) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
    setResult(null);
    setError(null);
  };

  const handleSubmit = async () => {
    const sources = Array.from(
      new Set(
        SEED_OPTIONS.filter((option) => selected[option.key]).map((option) => option.source),
      ),
    );

    if (sources.length === 0) {
      setError("Select at least one source.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/admin/content/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources, limitPerSource: limit }),
      });

      const data = (await res.json()) as { seeded?: number; errors?: string[]; error?: string };

      if (!res.ok) {
        setError(data.error || "Seed request failed.");
        return;
      }

      setResult({ seeded: data.seeded ?? 0, errors: data.errors });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sprout className="size-5" />
          Seed trending content
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Sources</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {SEED_OPTIONS.map((option) => (
              <div key={option.key} className="flex items-start gap-3">
                <Checkbox
                  id={option.key}
                  checked={selected[option.key]}
                  onCheckedChange={() => toggleOption(option.key)}
                  disabled={loading}
                />
                <div className="grid gap-1 leading-none">
                  <Label
                    htmlFor={option.key}
                    className="text-sm font-medium cursor-pointer"
                  >
                    {option.label}
                  </Label>
                  {option.experimental && (
                    <Badge variant="outline" className="w-fit text-[10px]">
                      Experimental
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="limit-per-source">Limit per source</Label>
          <Input
            id="limit-per-source"
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Number.parseInt(e.target.value || "1", 10)))}
            disabled={loading}
            className="max-w-[200px]"
          />
          <p className="text-xs text-muted-foreground">
            Maximum templates to import from each selected source.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert variant={result.seeded > 0 ? "default" : "destructive"}>
            {result.seeded > 0 ? (
              <CheckCircle2 className="size-4 text-emerald-600" />
            ) : (
              <AlertCircle className="size-4" />
            )}
            <AlertTitle>
              {result.seeded > 0 ? `Seeded ${result.seeded} templates` : "No templates seeded"}
            </AlertTitle>
            <AlertDescription>
              {result.errors && result.errors.length > 0 ? (
                <ul className="mt-2 list-disc pl-4 text-sm">
                  {result.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              ) : (
                "All selected providers completed without errors."
              )}
            </AlertDescription>
          </Alert>
        )}

        <Button
          onClick={handleSubmit}
          disabled={loading || selectedCount === 0}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Seeding...
            </>
          ) : (
            <>
              <Sprout className="mr-2 size-4" />
              Seed trending content
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
