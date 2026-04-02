'use client';

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
  // v2
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
  // v2
  growthStage: 'early',
};

const DRAFT_KEY = 'nativpost:brand-profile-draft';
const DRAFT_TIMESTAMP_KEY = 'nativpost:brand-profile-draft-ts';

function saveDraft(data: BrandProfileData) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    localStorage.setItem(DRAFT_TIMESTAMP_KEY, Date.now().toString());
  } catch {
    // localStorage unavailable
  }
}

function loadDraft(): { data: BrandProfileData; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const ts = localStorage.getItem(DRAFT_TIMESTAMP_KEY);
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

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(DRAFT_TIMESTAMP_KEY);
  } catch {
    // ignore
  }
}

/** Maps a server profile JSON object to local BrandProfileData shape. */
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
    // v2
    growthStage: (profile.growthStage as string) || 'early',
  };
}

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
  const [data, setData] = useState<BrandProfileData>(DEFAULT_PROFILE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [profileCompleteness, setProfileCompleteness] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  // Track whether we've finished the initial load so auto-save doesn't
  // write the DEFAULT_PROFILE to localStorage before the server data arrives.
  const loadedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -----------------------------------------------------------
  // Load on mount: server data is authoritative.
  // Draft is only applied if it was saved AFTER the last server save,
  // meaning the user had unsaved in-progress edits.
  // -----------------------------------------------------------
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/brand-profile');
        let serverData: BrandProfileData | null = null;
        let serverUpdatedAt: number = 0;

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

        // Only restore draft if it was saved after the last server update.
        const draft = loadDraft();
        const draftIsNewer = draft && draft.savedAt > serverUpdatedAt;

        if (draftIsNewer) {
          setHasDraft(true);
          setData(draft.data);
        } else {
          if (draft) {
            clearDraft();
          }
          if (serverData) {
            setData(serverData);
          }
        }
      } catch (err) {
        console.error('Failed to load brand profile:', err);
        const draft = loadDraft();
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
  }, []);

  // -----------------------------------------------------------
  // Auto-save draft to localStorage on every data change.
  // -----------------------------------------------------------
  useEffect(() => {
    if (!loadedRef.current) {
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      saveDraft(data);
      setHasDraft(true);
    }, 600);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [data]);

  const updateData = useCallback((updates: Partial<BrandProfileData>) => {
    setData(prev => ({ ...prev, ...updates }));
  }, []);

  const discardDraft = useCallback(() => {
    clearDraft();
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
  }, []);

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
      clearDraft();
      setHasDraft(false);
      return true;
    } catch (err) {
      console.error('Failed to save brand profile:', err);
      setError('Network error — please try again');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [data]);

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
