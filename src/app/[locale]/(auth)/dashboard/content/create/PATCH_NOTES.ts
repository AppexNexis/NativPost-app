/**
 * PATCH FILE — src/app/[locale]/(auth)/dashboard/content/create/page.tsx
 *
 * Apply these two targeted changes to the existing file.
 * Everything else stays identical.
 *
 * ─────────────────────────────────────────────────────────────────
 * CHANGE 1: Read `topic` and `contentType` from URL search params
 *
 * FIND (around line 136):
 *   const searchParams = useSearchParams();
 *   const scheduledDate = searchParams.get('scheduledDate') || '';
 *
 *   const [step, setStep] = useState<'type' | 'configure' | 'review'>('type');
 *   const [contentType, setContentType] = useState('');
 *   const [topic, setTopic] = useState('');
 *
 * REPLACE WITH:
 *   const searchParams = useSearchParams();
 *   const scheduledDate = searchParams.get('scheduledDate') || '';
 *   const prefillTopic = searchParams.get('topic') || '';
 *   const prefillContentType = searchParams.get('contentType') || '';
 *
 *   // If a topic and content type are prefilled from the Monthly Plan,
 *   // skip step 1 (content type picker) and start on configure.
 *   const [step, setStep] = useState<'type' | 'configure' | 'review'>(
 *     prefillTopic && prefillContentType ? 'configure' : 'type',
 *   );
 *   const [contentType, setContentType] = useState(prefillContentType);
 *   const [topic, setTopic] = useState(prefillTopic);
 *
 * ─────────────────────────────────────────────────────────────────
 * CHANGE 2: Add a Monthly Plan banner when a topic is prefilled
 *
 * FIND (around the scheduledDate banner, after the header section):
 *   {scheduledDate && (
 *     <div className="mb-5 flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
 *       <div className="size-1.5 shrink-0 rounded-full bg-violet-500" />
 *       <p className="text-sm text-muted-foreground">
 *         This post will be scheduled for ...
 *       </p>
 *     </div>
 *   )}
 *
 * ADD IMMEDIATELY BEFORE that block:
 *   {prefillTopic && (
 *     <div className="mb-4 flex items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
 *       <Sparkles className="size-3.5 shrink-0 text-violet-600" />
 *       <p className="text-sm text-muted-foreground">
 *         From your{' '}
 *         <span className="font-medium text-violet-700">Monthly Plan</span>
 *         {' — '}topic pre-filled. Edit it freely before generating.
 *       </p>
 *     </div>
 *   )}
 *
 * Also add Sparkles to the lucide-react import at the top of the file:
 *   import { ..., Sparkles } from 'lucide-react';
 *
 * ─────────────────────────────────────────────────────────────────
 * WHY THESE CHANGES ARE SUFFICIENT:
 *
 * The `topic` state is already wired to the generation payload
 * (line ~259: `topic: topic || undefined`).
 *
 * The `contentType` state is already wired to everything:
 * - The step 1 type picker sets it via setContentType()
 * - The generation payload uses it directly
 * - The step 2 configure header shows CONTENT_TYPES.find(t.id === contentType)
 *
 * By initialising both from URL params and skipping to 'configure' when
 * both are present, the Monthly Plan flow works perfectly with zero other
 * changes. The user lands on step 2 with topic and content type pre-set.
 *
 * The `scheduledDate` URL param already works end-to-end — the calendar
 * page continues to pass it as before, and the create page passes it
 * through to autoSchedule on approval.
 *
 * The Monthly Plan's "Create this post" link passes all three:
 *   /dashboard/content/create
 *     ?topic=<encoded>
 *     &contentType=<type>
 *     &scheduledDate=<YYYY-MM-DD>
 */

// This file is documentation only. Apply the patches above manually.
// No automated patch runner is needed — the changes are minimal and surgical.
