/**
 * Social Platform Icons — SVG components
 * Clean, monochrome icons for use across the dashboard.
 */

export function InstagramIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

export function FacebookIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
    </svg>
  );
}

export function LinkedInIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2zM4 6a2 2 0 100-4 2 2 0 000 4z" />
    </svg>
  );
}

export function TwitterIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function TikTokIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.73a8.19 8.19 0 004.76 1.52v-3.4a4.85 4.85 0 01-1-.16z" />
    </svg>
  );
}

export function YoutubeIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.015 3.015 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export function ThreadsIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.473 12.01v-.017c.027-3.579.877-6.433 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.018 5.143.725 7.132 2.102 1.85 1.287 3.156 3.087 3.88 5.352l-2.208.761c-1.226-3.772-4.102-5.831-8.808-5.863-2.916.02-5.129.831-6.58 2.408-1.42 1.544-2.145 3.874-2.167 6.929.022 3.048.747 5.375 2.166 6.916 1.451 1.575 3.665 2.385 6.583 2.405 2.674-.018 4.737-.715 6.131-2.07.897-.864 1.491-2.009 1.763-3.411h-8.24v-2.35h10.68c.081.492.12.991.12 1.49 0 5.973-3.978 9.331-10.46 9.331z" />
    </svg>
  );
}

export function PinterestIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
    </svg>
  );
}

export function SnapchatIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.004 2c-1.3 0-4.243.37-5.823 3.455-.518 1.007-.394 2.694-.33 3.73l-.003.003c-.007.111-.014.222-.02.333-.106.12-.37.264-.818.264-.22 0-.47-.043-.734-.128l-.009-.003c-.047-.015-.098-.024-.155-.024-.285 0-.536.208-.536.494 0 .252.176.454.426.52.016.005 1.655.425 1.875 1.657.008.047.024.09.046.13.388.71 1.022 1.174 1.782 1.174.17 0 .34-.02.506-.059.534-.124 1.064-.074 1.518.14.618.292 1.03.914 1.01 1.558-.007.218-.035.424-.084.616-.16.634-.604 1.047-1.14 1.047-.065 0-.13-.007-.193-.022-.16-.037-.31-.06-.456-.06-.24 0-.465.056-.65.162C8.6 17.2 8.327 17.77 8.327 18.46c0 .095.007.187.022.278.13.776.99 1.165 2.137 1.358.08.356.19.796.23.937.063.22.245.363.47.363h.033c.12-.007.242-.043.367-.107.387-.197.834-.3 1.414-.3.58 0 1.027.1 1.414.3.126.064.247.1.367.107h.033c.225 0 .407-.143.47-.363.04-.14.15-.58.23-.937 1.147-.193 2.007-.582 2.137-1.358.015-.09.022-.183.022-.278 0-.69-.274-1.26-.69-1.587-.185-.106-.41-.162-.65-.162-.147 0-.296.023-.456.06-.063.015-.128.022-.193.022-.537 0-.98-.413-1.14-1.047-.05-.192-.077-.398-.084-.616-.02-.644.392-1.266 1.01-1.558.454-.214.984-.264 1.518-.14.166.039.337.059.506.059.76 0 1.394-.464 1.782-1.174.022-.04.038-.083.046-.13.22-1.232 1.86-1.652 1.875-1.657.25-.066.426-.268.426-.52 0-.286-.251-.494-.536-.494-.057 0-.108.009-.155.024l-.009.003c-.264.085-.514.128-.734.128-.448 0-.712-.145-.818-.264-.006-.111-.013-.222-.02-.333l-.003-.003c.064-1.036.188-2.723-.33-3.73C16.247 2.37 13.304 2 12.004 2z" />
    </svg>
  );
}

export type PlatformInfo = {
  id: string;
  name: string;
  icon: typeof InstagramIcon;
  color: string;
  accountType?: 'personal' | 'page' | 'organization';
  description?: string;
};

export const PLATFORMS: PlatformInfo[] = [
  { id: 'instagram', name: 'Instagram', icon: InstagramIcon, color: '#E4405F', accountType: 'personal' },
  { id: 'facebook', name: 'Facebook', icon: FacebookIcon, color: '#1877F2', accountType: 'page' },
  { id: 'linkedin', name: 'LinkedIn', icon: LinkedInIcon, color: '#0A66C2', accountType: 'personal', description: 'Personal profile' },
  { id: 'linkedin_page', name: 'LinkedIn Page', icon: LinkedInIcon, color: '#0A66C2', accountType: 'organization', description: 'Company page' },
  { id: 'twitter', name: 'X / Twitter', icon: TwitterIcon, color: '#000000', accountType: 'personal' },
  { id: 'threads', name: 'Threads', icon: ThreadsIcon, color: '#000000', accountType: 'personal' },
  { id: 'tiktok', name: 'TikTok', icon: TikTokIcon, color: '#000000', accountType: 'personal' },
  { id: 'youtube', name: 'YouTube', icon: YoutubeIcon, color: '#FF0000', accountType: 'personal', description: 'Video only' },
  { id: 'pinterest', name: 'Pinterest', icon: PinterestIcon, color: '#E60023', accountType: 'personal' },
    { id: 'snapchat', name: 'Snapchat', icon: SnapchatIcon, color: '#FFFC00', accountType: 'personal', description: 'Story publishing' },
];

export function getPlatformIcon(platformId: string) {
  return PLATFORMS.find(p => p.id === platformId)?.icon || InstagramIcon;
}

export function getPlatformName(platformId: string) {
  return PLATFORMS.find(p => p.id === platformId)?.name || platformId;
}

export function PlatformIcons({ platforms, className = 'size-3.5' }: { platforms: string[]; className?: string }) {
  return (
    <span className="flex items-center gap-1">
      {platforms.map((p) => {
        const Icon = getPlatformIcon(p);
        return <Icon key={p} className={`${className} text-muted-foreground`} />;
      })}
    </span>
  );
}
