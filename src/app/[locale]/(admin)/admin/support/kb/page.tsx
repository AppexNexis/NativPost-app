'use client';

/**
 * src/app/[locale]/(admin)/admin/support/kb/page.tsx
 *
 * Knowledge base article management.
 * List, search, create, edit, publish/unpublish, delete.
 */

import {
  BookOpen,
  // ChevronDown,
  Edit2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
type Article = {
  id: string;
  title: string;
  slug: string;
  body: string;
  excerpt: string | null;
  category: string;
  tags: string[];
  isPublished: boolean;
  isInternal: boolean;
  helpful: number;
  notHelpful: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
};

// -----------------------------------------------------------
// CONFIG
// -----------------------------------------------------------
const CATEGORIES = [
  { value: 'billing',         label: 'Billing' },
  { value: 'features',        label: 'Features' },
  { value: 'integrations',    label: 'Integrations' },
  { value: 'troubleshooting', label: 'Troubleshooting' },
  { value: 'account',         label: 'Account' },
  { value: 'getting_started', label: 'Getting started' },
];

const CATEGORY_COLORS: Record<string, string> = {
  billing:         'bg-blue-50 text-blue-700',
  features:        'bg-purple-50 text-purple-700',
  integrations:    'bg-emerald-50 text-emerald-700',
  troubleshooting: 'bg-orange-50 text-orange-700',
  account:         'bg-zinc-100 text-zinc-700',
  getting_started: 'bg-teal-50 text-teal-700',
};

// -----------------------------------------------------------
// ARTICLE EDITOR MODAL
// -----------------------------------------------------------
function ArticleModal({
  article,
  onClose,
  onSaved,
}: {
  article: Article | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!article;
  const [title,       setTitle]       = useState(article?.title ?? '');
  const [body,        setBody]        = useState(article?.body ?? '');
  const [excerpt,     setExcerpt]     = useState(article?.excerpt ?? '');
  const [category,    setCategory]    = useState(article?.category ?? 'troubleshooting');
  const [isPublished, setIsPublished] = useState(article?.isPublished ?? true);
  const [isInternal,  setIsInternal]  = useState(article?.isInternal ?? false);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');

  const save = async () => {
    if (!title.trim() || !body.trim()) {
      setError('Title and body are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const url = isEdit
        ? `/api/admin/support/kb/${article.id}`
        : '/api/admin/support/kb';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, excerpt, category, isPublished, isInternal }),
      });
      if (!res.ok) throw new Error('Failed to save');
      onSaved();
      onClose();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[5vh]">
      <div className="flex h-[90vh] w-full max-w-3xl flex-col rounded-2xl border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold">
            {isEdit ? 'Edit article' : 'New article'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 gap-0 overflow-hidden">
          {/* Main editor */}
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. How to connect your LinkedIn account"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Excerpt</label>
              <input
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                placeholder="Short description shown in search results (optional)"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium">
                Body
                <span className="ml-2 text-xs font-normal text-muted-foreground">Markdown supported</span>
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write the article content here. Use ## for headings, **bold**, and - for bullet points."
                className="h-72 w-full resize-none rounded-lg border bg-muted/30 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          {/* Settings sidebar */}
          <div className="w-52 shrink-0 space-y-5 border-l bg-muted/20 p-5">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Category</p>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Visibility</p>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isPublished}
                    onChange={(e) => setIsPublished(e.target.checked)}
                    className="rounded"
                  />
                  Published
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                    className="rounded"
                  />
                  <span className="flex items-center gap-1">
                    <Lock className="size-3" />
                    Internal only
                  </span>
                </label>
              </div>
              {isInternal && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Internal articles are only visible to agents, not clients.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t px-6 py-4">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Create article'}
          </button>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// MAIN PAGE
// -----------------------------------------------------------
export default function KBArticlesPage() {
  const [articles,     setArticles]     = useState<Article[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filterCat,    setFilterCat]    = useState('all');
  const [editArticle,  setEditArticle]  = useState<Article | null | 'new'>('new');
  const [showModal,    setShowModal]    = useState(false);
  const [deleting,     setDeleting]     = useState<string | null>(null);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filterCat !== 'all') p.set('category', filterCat);
      if (search) p.set('search', search);
      const res  = await fetch(`/api/admin/support/kb?${p}`);
      const data = await res.json();
      setArticles(data.articles ?? []);
    } finally {
      setLoading(false);
    }
  }, [filterCat, search]);

  useEffect(() => { fetchArticles(); }, [fetchArticles]);

  const togglePublish = async (article: Article) => {
    await fetch(`/api/admin/support/kb/${article.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ isPublished: !article.isPublished }),
    });
    fetchArticles();
  };

  const deleteArticle = async (id: string) => {
    setDeleting(id);
    await fetch(`/api/admin/support/kb/${id}`, { method: 'DELETE' });
    setDeleting(null);
    fetchArticles();
  };

  const openNew    = () => { setEditArticle(null); setShowModal(true); };
  const openEdit   = (a: Article) => { setEditArticle(a); setShowModal(true); };
  const closeModal = () => setShowModal(false);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge base</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {articles.length} articles · used by AI to answer support tickets
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" />
          New article
        </button>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search articles..."
            className="h-9 rounded-lg border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-56"
          />
        </div>
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none"
        >
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Article list */}
      <div className="rounded-xl border bg-card">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <BookOpen className="size-8" />
            <p className="text-sm">No articles found</p>
            <button
              onClick={openNew}
              className="flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Plus className="size-3.5" />Create the first article
            </button>
          </div>
        ) : (
          <div className="divide-y">
            {articles.map((article) => (
              <div
                key={article.id}
                className="flex items-start gap-4 px-5 py-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium ${!article.isPublished ? 'text-muted-foreground' : ''}`}>
                      {article.title}
                    </p>
                    {!article.isPublished && (
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">Draft</span>
                    )}
                    {article.isInternal && (
                      <span className="flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                        <Lock className="size-2.5" />Internal
                      </span>
                    )}
                  </div>
                  {article.excerpt && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{article.excerpt}</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[article.category] ?? 'bg-muted text-muted-foreground'}`}>
                      {CATEGORIES.find((c) => c.value === article.category)?.label ?? article.category}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {article.viewCount} views · {article.helpful} helpful
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => togglePublish(article)}
                    title={article.isPublished ? 'Unpublish' : 'Publish'}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {article.isPublished
                      ? <Eye className="size-4" />
                      : <EyeOff className="size-4" />}
                  </button>
                  <button
                    onClick={() => openEdit(article)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Edit2 className="size-4" />
                  </button>
                  <button
                    onClick={() => deleteArticle(article.id)}
                    disabled={deleting === article.id}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                  >
                    {deleting === article.id
                      ? <Loader2 className="size-4 animate-spin" />
                      : <Trash2 className="size-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <ArticleModal
          article={typeof editArticle === 'object' ? editArticle : null}
          onClose={closeModal}
          onSaved={fetchArticles}
        />
      )}
    </div>
  );
}