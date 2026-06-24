import type { Metadata } from 'next';
import { AIStudioPage } from '@/components/ai-studio/AIStudioPage';
import type { AIInfluencer } from '@/types/v2';

export const metadata: Metadata = {
  title: 'AI Studio | NativPost',
  description: 'Create AI influencers and generate custom scenes',
};

const MOCK_INFLUENCERS: AIInfluencer[] = [
  {
    id: '1',
    orgId: 'org-1',
    name: 'Alex Morgan',
    description: 'Professional business consultant persona for B2B content',
    gender: 'female',
    ageRange: '30s',
    ethnicity: 'mixed',
    hairStyle: 'bob',
    hairColor: 'brown',
    bodyType: 'athletic',
    fashionStyle: 'business',
    poseStyle: 'professional',
    backgroundPreference: 'studio',
    baseImageUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=500&fit=crop',
    referenceImageUrls: [],
    loraModelId: null,
    usageCount: 24,
    isActive: true,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    orgId: 'org-1',
    name: 'Jordan Chen',
    description: 'Tech founder persona for startup content',
    gender: 'male',
    ageRange: '20s',
    ethnicity: 'asian',
    hairStyle: 'short',
    hairColor: 'black',
    bodyType: 'slim',
    fashionStyle: 'casual',
    poseStyle: 'relaxed',
    backgroundPreference: 'urban',
    baseImageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=500&fit=crop',
    referenceImageUrls: [],
    loraModelId: null,
    usageCount: 18,
    isActive: true,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  },
];

export default function Page() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <AIStudioPage influencers={MOCK_INFLUENCERS} />
      </div>
    </div>
  );
}
