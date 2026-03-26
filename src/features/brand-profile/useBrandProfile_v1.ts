'use client';

import { useCallback, useEffect, useState } from 'react';

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
  primaryColor: '#16A34A',
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
};

export function useBrandProfile(): UseBrandProfileReturn {
  const [data, setData] = useState<BrandProfileData>(DEFAULT_PROFILE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [profileCompleteness, setProfileCompleteness] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Load existing profile on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/brand-profile');
        if (res.ok) {
          const json = await res.json();
          if (json.profile) {
            setHasProfile(true);
            setProfileCompleteness(json.profile.profileCompleteness || 0);
            // Map DB fields back to client state
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
              primaryColor: json.profile.primaryColor || '#16A34A',
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
          }
        }
      } catch (err) {
        console.error('Failed to load brand profile:', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const updateData = useCallback((updates: Partial<BrandProfileData>) => {
    setData(prev => ({ ...prev, ...updates }));
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
  };
}
