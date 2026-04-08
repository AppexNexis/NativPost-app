'use client';

import { useOrganization } from '@clerk/nextjs';
import { useCallback, useEffect, useRef, useState } from 'react';

export type BrandProfileData = {
  brandName: string;
  industry: string;
  targetAudience: string;
  companyDescription: string;
  websiteUrl: string;
  toneFormality: number;
  toneHumor: number;
  toneEnergy: number;
  vocabulary: string[];
  forbiddenWords: string[];
  communicationStyle: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontPreference: string;
  imageStyle: string;
  logoUrl: string;
  contentExamples: string[];
  antiPatterns: string[];
  hashtagStrategy: string;
  linkedinVoice: string;
  instagramVoice: string;
  twitterVoice: string;
  facebookVoice: string;
  tiktokVoice: string;
  growthStage: string;
};

export const DEFAULT_PROFILE: BrandProfileData = {
  brandName: '',
  industry: '',
  targetAudience: '',
  companyDescription: '',
  websiteUrl: '',
  toneFormality: 5,
  toneHumor: 5,
  toneEnergy: 5,
  vocabulary: [],
  forbiddenWords: [],
  communicationStyle: '',
  primaryColor: '#864FFE',
  secondaryColor: '#1A1A1C',
  accentColor: '#FCFCFC',
  fontPreference: '',
  imageStyle: 'professional',
  logoUrl: '',
  contentExamples: [],
  antiPatterns: [],
  hashtagStrategy: '',
  linkedinVoice: '',
  instagramVoice: '',
  twitterVoice: '',
  facebookVoice: '',
  tiktokVoice: '',
  growthStage: 'early',
};

// -----------------------------------------------------------
// Draft helpers — all keyed by orgId so drafts never bleed
// between accounts, even on the same device.
// -----------------------------------------------------------

function draftKey(orgId: string) {
  return `nativpost:brand-profile-draft:${orgId}`;
}

function draftTsKey(orgId: string) {
  return `nativpost:brand-profile-draft-ts:${orgId}`;
}

function saveDraft(orgId: string, data: BrandProfileData) {
  try {
    localStorage.setItem(draftKey(orgId), JSON.stringify(data));
    localStorage.setItem(draftTsKey(orgId), Date.now().toString());
  } catch {
    // localStorage unavailable (SSR, private browsing, storage full)
  }
}

function loadDraft(orgId: string): { data: BrandProfileData; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(draftKey(orgId));
    const ts = localStorage.getItem(draftTsKey(orgId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<BrandProfileData>;
    return {
      data: { ...DEFAULT_PROFILE, ...parsed },
      savedAt: ts ? Number(ts) : 0,
    };
  } catch {
    return null;
  }
}

function clearDraft(orgId: string) {
  try {
    localStorage.removeItem(draftKey(orgId));
    localStorage.removeItem(draftTsKey(orgId));
  } catch {
    // ignore
  }
}

// Migrate any legacy unscoped draft to the new org-scoped key, then
// remove the old key so it can never leak to another org again.
function migrateLegacyDraft(orgId: string) {
  try {
    const legacyRaw = localStorage.getItem('nativpost:brand-profile-draft');
    const legacyTs = localStorage.getItem('nativpost:brand-profile-draft-ts');
    if (!legacyRaw) {
      return;
    }
    // Only migrate if the org doesn't already have a scoped draft
    if (!localStorage.getItem(draftKey(orgId))) {
      localStorage.setItem(draftKey(orgId), legacyRaw);
      if (legacyTs) {
        localStorage.setItem(draftTsKey(orgId), legacyTs);
      }
    }
    // Always remove the legacy keys regardless
    localStorage.removeItem('nativpost:brand-profile-draft');
    localStorage.removeItem('nativpost:brand-profile-draft-ts');
  } catch {
    // ignore
  }
}

// -----------------------------------------------------------
// Server profile mapper
// -----------------------------------------------------------
function mapServerProfile(profile: Record<string, unknown>): BrandProfileData {
  return {
    brandName: (profile.brandName as string) || '',
    industry: (profile.industry as string) || '',
    targetAudience: (profile.targetAudience as string) || '',
    companyDescription: (profile.companyDescription as string) || '',
    websiteUrl: (profile.websiteUrl as string) || '',
    toneFormality: (profile.toneFormality as number) ?? 5,
    toneHumor: (profile.toneHumor as number) ?? 5,
    toneEnergy: (profile.toneEnergy as number) ?? 5,
    vocabulary: (profile.vocabulary as string[]) || [],
    forbiddenWords: (profile.forbiddenWords as string[]) || [],
    communicationStyle: (profile.communicationStyle as string) || '',
    primaryColor: (profile.primaryColor as string) || '#864FFE',
    secondaryColor: (profile.secondaryColor as string) || '#1A1A1C',
    accentColor: (profile.accentColor as string) || '#FCFCFC',
    fontPreference: (profile.fontPreference as string) || '',
    imageStyle: (profile.imageStyle as string) || 'professional',
    logoUrl: (profile.logoUrl as string) || '',
    contentExamples: (profile.contentExamples as string[]) || [],
    antiPatterns: (profile.antiPatterns as string[]) || [],
    hashtagStrategy: (profile.hashtagStrategy as string) || '',
    linkedinVoice: (profile.linkedinVoice as string) || '',
    instagramVoice: (profile.instagramVoice as string) || '',
    twitterVoice: (profile.twitterVoice as string) || '',
    facebookVoice: (profile.facebookVoice as string) || '',
    tiktokVoice: (profile.tiktokVoice as string) || '',
    growthStage: (profile.growthStage as string) || 'early',
  };
}

// -----------------------------------------------------------
// Hook
// -----------------------------------------------------------
type UseBrandProfileReturn = {
  data: BrandProfileData;
  setData: React.Dispatch<React.SetStateAction<BrandProfileData>>;
  updateData: (updates: Partial<BrandProfileData>) => void;
  isLoading: boolean;
  isSaving: boolean;
  hasProfile: boolean;
  profileCompleteness: number;
  save: () => Promise<boolean>;
  error: string | null;
  hasDraft: boolean;
  discardDraft: () => void;
};

export function useBrandProfile(): UseBrandProfileReturn {
  // Clerk's useOrganization gives us the org ID on the client without
  // needing to pass it as a prop. organization is null while loading.
  const { organization } = useOrganization();
  const orgId = organization?.id ?? null;

  const [data, setData] = useState<BrandProfileData>(DEFAULT_PROFILE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [profileCompleteness, setProfileCompleteness] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  // Prevent auto-save from writing DEFAULT_PROFILE before server data arrives
  const loadedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -----------------------------------------------------------
  // Load: runs once orgId is known. Server data is authoritative.
  // Draft is only restored if it was saved after the last server save.
  // -----------------------------------------------------------
  useEffect(() => {
    // Wait until Clerk has resolved the org before doing anything
    if (!orgId) {
      return;
    }

    async function load() {
      migrateLegacyDraft(orgId!);

      try {
        const res = await fetch('/api/brand-profile');
        let serverData: BrandProfileData | null = null;
        let serverUpdatedAt = 0;

        if (res.ok) {
          const json = await res.json();
          if (json.profile) {
            setHasProfile(true);
            setProfileCompleteness(json.profile.profileCompleteness || 0);
            serverUpdatedAt = json.profile.updatedAt
              ? new Date(json.profile.updatedAt).getTime()
              : 0;
            serverData = mapServerProfile(json.profile);
          }
        }

        const draft = loadDraft(orgId!);
        const draftIsNewer = draft && draft.savedAt > serverUpdatedAt;

        if (draftIsNewer) {
          setHasDraft(true);
          setData(draft.data);
        } else {
          // Draft is stale or doesn't exist — clear it and use server data
          if (draft) {
            clearDraft(orgId!);
          }
          if (serverData) {
            setData(serverData);
          }
        }
      } catch (err) {
        console.error('Failed to load brand profile:', err);
        // Fall back to draft on network error, still org-scoped
        const draft = loadDraft(orgId!);
        if (draft) {
          setHasDraft(true);
          setData(draft.data);
        }
      } finally {
        loadedRef.current = true;
        setIsLoading(false);
      }
    }

    load();
  }, [orgId]);

  // -----------------------------------------------------------
  // Auto-save draft on data change — org-scoped, debounced 600ms
  // Skipped until both the org is known and initial load is done
  // -----------------------------------------------------------
  useEffect(() => {
    if (!loadedRef.current || !orgId) {
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      saveDraft(orgId, data);
      setHasDraft(true);
    }, 600);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [data, orgId]);

  const updateData = useCallback((updates: Partial<BrandProfileData>) => {
    setData(prev => ({ ...prev, ...updates }));
  }, []);

  const discardDraft = useCallback(() => {
    if (!orgId) {
      return;
    }
    clearDraft(orgId);
    setHasDraft(false);
    fetch('/api/brand-profile').then(async (res) => {
      if (!res.ok) {
        return;
      }
      const json = await res.json();
      if (!json.profile) {
        return;
      }
      setData(mapServerProfile(json.profile));
    });
  }, [orgId]);

  const save = useCallback(async (): Promise<boolean> => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/brand-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Failed to save');
        return false;
      }

      const json = await res.json();
      setHasProfile(true);
      setProfileCompleteness(json.profile.profileCompleteness || 0);
      if (orgId) {
        clearDraft(orgId);
      }
      setHasDraft(false);
      return true;
    } catch (err) {
      console.error('Failed to save brand profile:', err);
      setError('Network error — please try again');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [data, orgId]);

  return {
    data,
    setData,
    updateData,
    isLoading,
    isSaving,
    hasProfile,
    profileCompleteness,
    save,
    error,
    hasDraft,
    discardDraft,
  };
}
