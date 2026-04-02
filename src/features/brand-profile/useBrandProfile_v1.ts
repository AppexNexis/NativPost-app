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
            // Parse the server's updatedAt so we can compare with draft timestamp
            serverUpdatedAt = json.profile.updatedAt
              ? new Date(json.profile.updatedAt).getTime()
              : 0;

            serverData = {
              brandName: json.profile.brandName || '',
              industry: json.profile.industry || '',
              targetAudience: json.profile.targetAudience || '',
              companyDescription: json.profile.companyDescription || '',
              websiteUrl: json.profile.websiteUrl || '',
              toneFormality: json.profile.toneFormality ?? 5,
              toneHumor: json.profile.toneHumor ?? 5,
              toneEnergy: json.profile.toneEnergy ?? 5,
              vocabulary: json.profile.vocabulary || [],
              forbiddenWords: json.profile.forbiddenWords || [],
              communicationStyle: json.profile.communicationStyle || '',
              primaryColor: json.profile.primaryColor || '#864FFE',
              secondaryColor: json.profile.secondaryColor || '#1A1A1C',
              accentColor: json.profile.accentColor || '#FCFCFC',
              fontPreference: json.profile.fontPreference || '',
              imageStyle: json.profile.imageStyle || 'professional',
              logoUrl: json.profile.logoUrl || '',
              contentExamples: json.profile.contentExamples || [],
              antiPatterns: json.profile.antiPatterns || [],
              hashtagStrategy: json.profile.hashtagStrategy || '',
              linkedinVoice: json.profile.linkedinVoice || '',
              instagramVoice: json.profile.instagramVoice || '',
              twitterVoice: json.profile.twitterVoice || '',
              facebookVoice: json.profile.facebookVoice || '',
              tiktokVoice: json.profile.tiktokVoice || '',
            };
          }
        }

        // Only restore draft if it was saved after the last server update.
        // This means the user started editing but didn't finish.
        // If server data is newer, discard the stale draft silently.
        const draft = loadDraft();
        const draftIsNewer = draft && draft.savedAt > serverUpdatedAt;

        if (draftIsNewer) {
          setHasDraft(true);
          setData(draft.data);
        } else {
          // Server data is authoritative — discard any stale draft
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
  // Only fires after initial load is complete.
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
    // Reload server data to restore the saved state
    fetch('/api/brand-profile').then(async (res) => {
      if (!res.ok) {
        return;
      }
      const json = await res.json();
      if (!json.profile) {
        return;
      }
      setData({
        brandName: json.profile.brandName || '',
        industry: json.profile.industry || '',
        targetAudience: json.profile.targetAudience || '',
        companyDescription: json.profile.companyDescription || '',
        websiteUrl: json.profile.websiteUrl || '',
        toneFormality: json.profile.toneFormality ?? 5,
        toneHumor: json.profile.toneHumor ?? 5,
        toneEnergy: json.profile.toneEnergy ?? 5,
        vocabulary: json.profile.vocabulary || [],
        forbiddenWords: json.profile.forbiddenWords || [],
        communicationStyle: json.profile.communicationStyle || '',
        primaryColor: json.profile.primaryColor || '#864FFE',
        secondaryColor: json.profile.secondaryColor || '#1A1A1C',
        accentColor: json.profile.accentColor || '#FCFCFC',
        fontPreference: json.profile.fontPreference || '',
        imageStyle: json.profile.imageStyle || 'professional',
        logoUrl: json.profile.logoUrl || '',
        contentExamples: json.profile.contentExamples || [],
        antiPatterns: json.profile.antiPatterns || [],
        hashtagStrategy: json.profile.hashtagStrategy || '',
        linkedinVoice: json.profile.linkedinVoice || '',
        instagramVoice: json.profile.instagramVoice || '',
        twitterVoice: json.profile.twitterVoice || '',
        facebookVoice: json.profile.facebookVoice || '',
        tiktokVoice: json.profile.tiktokVoice || '',
      });
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
