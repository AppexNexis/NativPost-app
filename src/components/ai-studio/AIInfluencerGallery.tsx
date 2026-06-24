import React, { useState } from 'react';
import Image from 'next/image';
// import { Plus, Wand2, ImageIcon, BarChart3, MoreHorizontal, Trash2, RefreshCw } from 'lucide-react';
import { Plus, Wand2, ImageIcon, BarChart3, Trash2, } from 'lucide-react';
import type { AIInfluencer } from '@/types/v2';

interface AIInfluencerGalleryProps {
  influencers: AIInfluencer[];
  onCreate: () => void;
  onEdit: (influencer: AIInfluencer) => void;
  onDelete: (id: string) => void;
  onGenerateScene: (influencerId: string) => void;
}

export function AIInfluencerGallery({ influencers, onCreate, onEdit, onDelete, onGenerateScene }: AIInfluencerGalleryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = influencers.find((i) => i.id === selectedId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">AI Influencers</h2>
          <p className="text-sm text-gray-500">
            Create persistent characters that appear across your content. Train once, use everywhere.
          </p>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-700"
        >
          <Plus className="h-4 w-4" />
          Create Influencer
        </button>
      </div>

      {/* Gallery Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {influencers.map((influencer) => (
          <InfluencerCard
            key={influencer.id}
            influencer={influencer}
            isSelected={selectedId === influencer.id}
            onSelect={() => setSelectedId(influencer.id)}
            onEdit={() => onEdit(influencer)}
            onDelete={() => onDelete(influencer.id)}
            onGenerateScene={() => onGenerateScene(influencer.id)}
          />
        ))}

        {/* Create card */}
        <button
          onClick={onCreate}
          className="flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 transition-colors hover:border-purple-300 hover:bg-purple-50"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
            <Plus className="h-6 w-6 text-purple-600" />
          </div>
          <span className="text-sm font-medium text-purple-600">Create New</span>
        </button>
      </div>

      {influencers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Wand2 className="mb-4 h-12 w-12" />
          <p className="text-lg font-medium">No influencers yet</p>
          <p className="text-sm">Create your first AI influencer to get started</p>
        </div>
      )}

      {/* Detail Panel */}
      {selected && (
        <InfluencerDetailPanel
          influencer={selected}
          onClose={() => setSelectedId(null)}
          onEdit={() => onEdit(selected)}
          onGenerateScene={() => onGenerateScene(selected.id)}
        />
      )}
    </div>
  );
}

// ============================================================
// Influencer Card
// ============================================================
function InfluencerCard({
  influencer,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onGenerateScene,
}: {
  influencer: AIInfluencer;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onGenerateScene: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-white transition-all ${isSelected ? 'border-purple-500 ring-2 ring-purple-500' : 'border-gray-200 hover:shadow-lg'
        }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onSelect}
    >
      {/* Reference Image */}
      <div className="relative aspect-[3/4] overflow-hidden bg-gray-100">
        {influencer.baseImageUrl ? (
          <Image
            src={influencer.baseImageUrl}
            alt={influencer.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, 20vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-300">
            <ImageIcon className="h-12 w-12" />
          </div>
        )}

        {/* Hover overlay */}
        <div
          className={`absolute inset-0 flex flex-col justify-end bg-gradient-to-b from-transparent via-black/20 to-black/70 p-3 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'
            }`}
        >
          <div className="flex gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="flex flex-1 items-center justify-center rounded-lg bg-white/90 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-white"
            >
              Edit
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onGenerateScene(); }}
              className="flex flex-1 items-center justify-center rounded-lg bg-purple-500/90 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-600"
            >
              Generate
            </button>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{influencer.name}</h3>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {influencer.gender && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 capitalize">
              {influencer.gender}
            </span>
          )}
          {influencer.ageRange && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
              {influencer.ageRange}
            </span>
          )}
          {influencer.fashionStyle && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 capitalize">
              {influencer.fashionStyle}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
          <BarChart3 className="h-3 w-3" />
          <span>{influencer.usageCount} uses</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Influencer Detail Panel
// ============================================================
function InfluencerDetailPanel({
  influencer,
  onClose,
  onEdit,
  onGenerateScene,
}: {
  influencer: AIInfluencer;
  onClose: () => void;
  onEdit: () => void;
  onGenerateScene: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col md:flex-row">
          {/* Image */}
          <div className="relative aspect-square w-full md:w-1/2 bg-gray-100">
            {influencer.baseImageUrl ? (
              <Image
                src={influencer.baseImageUrl}
                alt={influencer.name}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 400px"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-300">
                <ImageIcon className="h-20 w-20" />
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{influencer.name}</h3>
                <p className="mt-1 text-sm text-gray-500">{influencer.description}</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Traits */}
            <div className="mt-6 grid grid-cols-2 gap-4">
              <TraitRow label="Gender" value={influencer.gender} />
              <TraitRow label="Age Range" value={influencer.ageRange} />
              <TraitRow label="Ethnicity" value={influencer.ethnicity} />
              <TraitRow label="Hair Style" value={influencer.hairStyle} />
              <TraitRow label="Hair Color" value={influencer.hairColor} />
              <TraitRow label="Body Type" value={influencer.bodyType} />
              <TraitRow label="Fashion" value={influencer.fashionStyle} />
              <TraitRow label="Pose Style" value={influencer.poseStyle} />
              <TraitRow label="Background" value={influencer.backgroundPreference} />
            </div>

            {/* Usage */}
            <div className="mt-6 rounded-xl bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold text-gray-900">{influencer.usageCount}</div>
                  <div className="text-xs text-gray-500 uppercase">Total uses</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">
                    {influencer.loraModelId ? 'LoRA Trained' : 'Reference-only'}
                  </div>
                  <div className="text-xs text-gray-500">Consistency mode</div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={onEdit}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Edit Traits
              </button>
              <button
                onClick={onGenerateScene}
                className="flex-1 rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-700"
              >
                Generate Scene
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TraitRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-gray-900 capitalize">{value}</div>
    </div>
  );
}
