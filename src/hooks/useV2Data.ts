import { useState, useCallback, useEffect } from 'react';
import type { ContentTemplate, Campaign, AIInfluencer, MediaAsset, ContentAngle } from '@/types/v2';

// Content Templates hook
export function useTemplates(options: { contentType?: string; niche?: string; platform?: string; sort?: string } = {}) {
  const [templates, setTemplates] = useState<ContentTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (options.contentType) params.set('contentType', options.contentType);
      if (options.niche) params.set('niche', options.niche);
      if (options.platform) params.set('platform', options.platform);
      if (options.sort) params.set('sort', options.sort);
      const res = await fetch(`/api/templates?${params.toString()}`);
      const data = await res.json();
      setTemplates(data.items || []);
    } finally {
      setLoading(false);
    }
  }, [options.contentType, options.niche, options.platform, options.sort]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  return { templates, loading, refetch: fetchTemplates };
}

// Campaigns hook
export function useCampaigns(status?: string) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const params = status ? `?status=${status}` : '';
      const res = await fetch(`/api/campaigns${params}`);
      const data = await res.json();
      setCampaigns(data.items || []);
    } finally {
      setLoading(false);
    }
  }, [status]);

  const createCampaign = useCallback(async (campaign: Partial<Campaign>) => {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(campaign),
    });
    const data = await res.json();
    await fetchCampaigns();
    return data.item as Campaign;
  }, [fetchCampaigns]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  return { campaigns, loading, createCampaign, refetch: fetchCampaigns };
}

// AI Influencers hook
export function useInfluencers() {
  const [influencers, setInfluencers] = useState<AIInfluencer[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchInfluencers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai-influencers');
      const data = await res.json();
      setInfluencers(data.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInfluencers(); }, [fetchInfluencers]);

  return { influencers, loading, refetch: fetchInfluencers };
}

// Content Angles hook
export function useAngles() {
  const [angles, setAngles] = useState<ContentAngle[]>([]);

  const fetchAngles = useCallback(async () => {
    const res = await fetch('/api/content-angles');
    const data = await res.json();
    setAngles(data.items || []);
  }, []);

  useEffect(() => { fetchAngles(); }, [fetchAngles]);

  return { angles, refetch: fetchAngles };
}

// Media Assets hook
export function useMediaAssets(filters: { assetType?: string; aspectRatio?: string } = {}) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.assetType) params.set('assetType', filters.assetType);
      if (filters.aspectRatio) params.set('aspectRatio', filters.aspectRatio);
      const res = await fetch(`/api/media-assets?${params.toString()}`);
      const data = await res.json();
      setAssets(data.items || []);
    } finally {
      setLoading(false);
    }
  }, [filters.assetType, filters.aspectRatio]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  return { assets, loading, refetch: fetchAssets };
}
