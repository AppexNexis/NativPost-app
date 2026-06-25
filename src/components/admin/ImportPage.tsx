"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  FileJson,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Download,
  FileCheck,
  Loader2,
  ArrowLeft,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

type ImportTemplate = {
  sourceUrl: string;
  sourcePlatform: string;
  sourceCreator?: string;
  contentType: string;
  thumbnailUrl: string;
  durationSeconds?: number;
  niches: string[];
  angles: string[];
  structure?: Record<string, unknown>;
};

type ValidationError = {
  index: number;
  field: string;
  message: string;
};

type ImportHistory = {
  id: string;
  filename: string;
  format: string;
  total: number;
  imported: number;
  errors: number;
  status: string;
  createdAt: string;
};

// ── Constants ─────────────────────────────────────────────────────────────

const VALID_PLATFORMS = ["tiktok", "instagram", "youtube", "facebook", "linkedin", "twitter"];
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

const MOCK_HISTORY: ImportHistory[] = [
  {
    id: "1",
    filename: "templates-batch-1.json",
    format: "json",
    total: 50,
    imported: 48,
    errors: 2,
    status: "completed",
    createdAt: "2024-06-20T10:30:00Z",
  },
  {
    id: "2",
    filename: "viral-content.csv",
    format: "csv",
    total: 120,
    imported: 115,
    errors: 5,
    status: "completed",
    createdAt: "2024-06-18T14:15:00Z",
  },
  {
    id: "3",
    filename: "summer-campaign.json",
    format: "json",
    total: 25,
    imported: 0,
    errors: 25,
    status: "failed",
    createdAt: "2024-06-15T09:00:00Z",
  },
];

// ── Helper: CSV parser ────────────────────────────────────────────────────

function parseCSV(text: string): ImportTemplate[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  // lines[0] is typed `string | undefined` by the compiler (array indexing),
  // even though we just checked length >= 2 — narrow it explicitly.
  const headerLine = lines[0];
  if (!headerLine) return [];

  const headers = headerLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const templates: ImportTemplate[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });

    const durationRaw = row.durationSeconds || row.duration_seconds;

    templates.push({
      sourceUrl: row.sourceUrl || row.source_url || "",
      sourcePlatform: row.sourcePlatform || row.source_platform || "",
      sourceCreator: row.sourceCreator || row.source_creator || undefined,
      contentType: row.contentType || row.content_type || "",
      thumbnailUrl: row.thumbnailUrl || row.thumbnail_url || "",
      durationSeconds: durationRaw ? parseInt(durationRaw, 10) : undefined,
      niches: (row.niches || "").split(";").filter(Boolean),
      angles: (row.angles || "").split(";").filter(Boolean),
    });
  }

  return templates;
}

// ── Helper: JSON parser ───────────────────────────────────────────────────

function parseJSON(text: string): ImportTemplate[] {
  const data = JSON.parse(text);
  return Array.isArray(data) ? data : data.templates || [];
}

// ── Helper: Validate ────────────────────────────────────────────────────────

function validateTemplates(templates: ImportTemplate[]): ValidationError[] {
  const errors: ValidationError[] = [];

  templates.forEach((t, index) => {
    if (!t.sourceUrl || !t.sourceUrl.startsWith("http")) {
      errors.push({ index, field: "sourceUrl", message: "Valid source URL is required" });
    }
    if (!VALID_PLATFORMS.includes(t.sourcePlatform)) {
      errors.push({ index, field: "sourcePlatform", message: `Must be one of: ${VALID_PLATFORMS.join(", ")}` });
    }
    if (!VALID_CONTENT_TYPES.includes(t.contentType)) {
      errors.push({ index, field: "contentType", message: `Must be one of: ${VALID_CONTENT_TYPES.join(", ")}` });
    }
    if (!t.thumbnailUrl || !t.thumbnailUrl.startsWith("http")) {
      errors.push({ index, field: "thumbnailUrl", message: "Valid thumbnail URL is required" });
    }
  });

  return errors;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [templates, setTemplates] = useState<ImportTemplate[]>([]);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<{ imported: number; errors: number } | null>(null);
  const [showSampleDialog, setShowSampleDialog] = useState(false);
  const [history, setHistory] = useState<ImportHistory[]>(MOCK_HISTORY);

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    let parsed: ImportTemplate[] = [];

    try {
      if (file.name.endsWith(".json")) {
        parsed = parseJSON(text);
      } else if (file.name.endsWith(".csv")) {
        parsed = parseCSV(text);
      } else {
        throw new Error("Unsupported file format. Use .json or .csv");
      }
    } catch (err: any) {
      setErrors([{ index: -1, field: "file", message: err.message }]);
      return;
    }

    setTemplates(parsed);
    const validationErrors = validateTemplates(parsed);
    setErrors(validationErrors);
    setStep(2);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleImport = useCallback(async () => {
    if (errors.length > 0) return;

    setImporting(true);
    setImportProgress(0);

    try {
      const res = await fetch("/api/admin/templates/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates }),
      });

      const result = await res.json();
      setImportResult({ imported: result.imported ?? 0, errors: result.errors?.length ?? 0 });
      setStep(3);

      // Add to history
      if (res.ok) {
        setHistory((prev) => [
          {
            id: Date.now().toString(),
            filename: "manual-import.json",
            format: "json",
            total: templates.length,
            imported: result.imported ?? 0,
            errors: result.errors?.length ?? 0,
            status: result.errors?.length > 0 ? "partial" : "completed",
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
    } catch {
      setImportResult({ imported: 0, errors: templates.length });
      setStep(3);
    } finally {
      setImporting(false);
    }
  }, [errors, templates]);

  const generateSampleJSON = () => {
    const sample = {
      templates: Array.from({ length: 5 }, (_, i) => ({
        sourceUrl: `https://www.tiktok.com/@creator/video/1234567890${i}`,
        sourcePlatform: "tiktok",
        sourceCreator: "creator_handle",
        thumbnailUrl: `https://example.com/thumb${i}.jpg`,
        contentType: "slideshow",
        niches: ["b2b_saas"],
        angles: ["time_vs_growth"],
        durationSeconds: 15,
      })),
    };
    const blob = new Blob([JSON.stringify(sample, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template-import-sample.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const validCount = templates.length - errors.filter((e) => e.index >= 0).length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bulk import</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Import templates from CSV or JSON files
        </p>
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload file</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/20"
              }`}
            >
              <Upload className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">Drag and drop a file here</p>
              <p className="text-xs text-muted-foreground">or</p>
              <Input
                type="file"
                accept=".json,.csv"
                className="mx-auto mt-2 max-w-[200px]"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Supports JSON and CSV files up to 10MB
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowSampleDialog(true)}>
                <FileJson className="mr-2 size-4" />
                View sample format
              </Button>
              <Button variant="outline" size="sm" onClick={generateSampleJSON}>
                <Download className="mr-2 size-4" />
                Download sample
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview */}
      {step === 2 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              Preview ({templates.length} templates)
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 size-4" />
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={validCount === 0 || importing}
              >
                {importing ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <FileCheck className="mr-2 size-4" />
                    Import {validCount} templates
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {errors.length > 0 && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="size-4" />
                <AlertTitle>Validation errors</AlertTitle>
                <AlertDescription>
                  {errors.length} template(s) have errors. Fix or remove them before importing.
                </AlertDescription>
              </Alert>
            )}

            {importing && (
              <div className="mb-4 space-y-2">
                <Progress value={importProgress} />
                <p className="text-sm text-muted-foreground">Importing templates...</p>
              </div>
            )}

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">#</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Content Type</TableHead>
                    <TableHead>Thumbnail</TableHead>
                    <TableHead>Niches</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.slice(0, 5).map((t, i) => {
                    const rowErrors = errors.filter((e) => e.index === i);
                    const hasError = rowErrors.length > 0;

                    return (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="capitalize">{t.sourcePlatform}</TableCell>
                        <TableCell className="capitalize">{t.contentType.replace(/_/g, " ")}</TableCell>
                        <TableCell>
                          
                          <a  href={t.thumbnailUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline truncate max-w-[120px] inline-block"
                          >
                            View
                          </a>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {t.niches.slice(0, 2).map((n) => (
                              <Badge key={n} variant="secondary" className="text-[10px]">
                                {n}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {hasError ? (
                            <Badge variant="destructive" className="text-[10px]">
                              <XCircle className="mr-1 size-3" />
                              {rowErrors.length} error(s)
                            </Badge>
                          ) : (
                            <Badge variant="default" className="text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                              <CheckCircle2 className="mr-1 size-3" />
                              Valid
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {templates.length > 5 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Showing 5 of {templates.length} templates. All will be imported.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Result */}
      {step === 3 && importResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border bg-emerald-50 p-4 text-center">
                <p className="text-2xl font-semibold text-emerald-700">{importResult.imported}</p>
                <p className="text-sm text-emerald-600">Imported successfully</p>
              </div>
              <div className="rounded-lg border bg-red-50 p-4 text-center">
                <p className="text-2xl font-semibold text-red-700">{importResult.errors}</p>
                <p className="text-sm text-red-600">Failed</p>
              </div>
            </div>
            <Button onClick={() => { setStep(1); setTemplates([]); setErrors([]); setImportResult(null); }}>
              Import more templates
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Import History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import history</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filename</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Imported</TableHead>
                  <TableHead>Errors</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{h.filename}</TableCell>
                    <TableCell className="uppercase">{h.format}</TableCell>
                    <TableCell>{h.total}</TableCell>
                    <TableCell>{h.imported}</TableCell>
                    <TableCell>{h.errors}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          h.status === "completed"
                            ? "default"
                            : h.status === "partial"
                            ? "secondary"
                            : "destructive"
                        }
                        className="text-[10px]"
                      >
                        {h.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(h.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Sample Dialog */}
      <Dialog open={showSampleDialog} onOpenChange={setShowSampleDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sample import format</DialogTitle>
            <DialogDescription>
              JSON format for importing templates
            </DialogDescription>
          </DialogHeader>
          <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto max-h-[400px]">
{`{
  "templates": [
    {
      "sourceUrl": "https://www.tiktok.com/@creator/video/1234567890",
      "sourcePlatform": "tiktok",
      "sourceCreator": "creator_handle",
      "thumbnailUrl": "https://example.com/thumb.jpg",
      "contentType": "slideshow",
      "niches": ["b2b_saas", "agency"],
      "angles": ["time_vs_growth"],
      "durationSeconds": 15
    }
  ]
}`}
          </pre>
          <Button onClick={generateSampleJSON}>
            <Download className="mr-2 size-4" />
            Download sample file
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}