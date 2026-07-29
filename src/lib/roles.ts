/**
 * NativPost Role-Based Access
 *
 * Fully-managed model:
 * - "admin" / "editor" = NativPost team (AppexNexis staff)
 *   → Full access: create content, manage calendar, edit Brand Profile
 * - "member" = Customer
 *   → Approve/reject content, view calendar, view analytics, manage connections
 *
 * Clerk org roles: org:admin, org:member (default)
 * Custom roles added via Clerk dashboard: org:editor
 */

export type UserRole = 'admin' | 'editor' | 'member';

export function getUserRole(orgRole: string | null | undefined): UserRole {
  if (!orgRole) {
    return 'member';
  }
  if (orgRole === 'org:admin') {
    return 'admin';
  }
  if (orgRole === 'org:editor') {
    return 'editor';
  }
  return 'member';
}

export function isTeamMember(role: UserRole): boolean {
  return role === 'admin' || role === 'editor';
}

export function isCustomer(role: UserRole): boolean {
  return role === 'member';
}

/**
 * Navigation items filtered by role.
 * Team members see everything.
 * Customers see a simplified, approval-focused dashboard.
 */
export type NavItem = {
  label: string;
  href: string;
  icon: string; // lucide icon name (must exist in ICONS map in DashboardClientLayout)
  roles: UserRole[];
  group: string;
  badge?: string;
  external?: boolean; // renders as <a target="_blank"> instead of <Link>
  planRequired?: string[]; // plans that unlock this item — shows upgrade hint if not met
  subGroup?: boolean; // renders inside a collapsible sub-section of the parent group
  footer?: boolean; // pinned in the bottom cluster above the user avatar (out of the scroll list)
};

// Ordering rules:
// - Primary "Menu" group carries the high-traffic destinations first, in the
//   order product wants them surfaced (Calendar → Campaigns), so the sidebar
//   reads top-to-bottom by importance and fits one viewport without scrolling.
// - Secondary account/resource links carry `footer: true` and render in a
//   pinned cluster above the avatar (usefastlane / Fish Audio pattern).
// - Docs + Discord are intentionally NOT here — they live in the top navbar as
//   icon links, keeping the sidebar focused on in-app navigation.
export const NAV_ITEMS: NavItem[] = [
  // --- Menu (primary — high-traffic destinations, priority order) ---
  { label: 'Calendar', href: '/dashboard/calendar', icon: 'Calendar', roles: ['admin', 'editor', 'member'], group: 'Menu' },
  { label: 'Blitz', href: '/dashboard/blitz', icon: 'Zap', roles: ['admin', 'editor', 'member'], group: 'Menu' },
  { label: 'All posts', href: '/dashboard/posts', icon: 'LayoutList', roles: ['admin', 'editor', 'member'], group: 'Menu' },
  { label: 'Influencers', href: '/dashboard/influencers', icon: 'UserRound', roles: ['admin', 'editor'], group: 'Menu' },
  { label: 'AI Studio', href: '/dashboard/ai-studio', icon: 'Sparkles', roles: ['admin', 'editor', 'member'], group: 'Menu' },
  { label: 'Infrastructure', href: '/dashboard/infrastructure', icon: 'Boxes', roles: ['admin', 'editor', 'member'], group: 'Menu' },
  { label: 'Campaigns', href: '/dashboard/campaigns', icon: 'Megaphone', roles: ['admin', 'editor', 'member'], group: 'Menu' },
  { label: 'Content Library', href: '/dashboard/content-library', icon: 'BookOpen', roles: ['admin', 'editor', 'member'], group: 'Menu' },
  { label: 'Analytics', href: '/dashboard/analytics', icon: 'BarChart3', roles: ['admin', 'editor', 'member'], group: 'Menu' },

  // --- Post status filters (collapsible sub-section under Menu) ---
  { label: 'Scheduled', href: '/dashboard/posts?status=scheduled', icon: 'Clock', roles: ['admin', 'editor', 'member'], group: 'Menu', subGroup: true },
  { label: 'Published', href: '/dashboard/posts?status=published', icon: 'CheckCircle2', roles: ['admin', 'editor', 'member'], group: 'Menu', subGroup: true },
  { label: 'Drafts', href: '/dashboard/posts?status=draft', icon: 'FileText', roles: ['admin', 'editor'], group: 'Menu', subGroup: true },
  { label: 'Approvals', href: '/dashboard/approvals', icon: 'CircleCheck', roles: ['admin', 'editor', 'member'], group: 'Menu', subGroup: true },

  // --- Create (team only) ---
  { label: 'Brand Profile', href: '/dashboard/brand-profile', icon: 'Fingerprint', roles: ['admin', 'editor'], group: 'Create' },
  { label: 'Media library', href: '/dashboard/media-library', icon: 'Image', roles: ['admin', 'editor'], group: 'Create' },

  // --- Workspace ---
  { label: 'Social accounts', href: '/dashboard/social-accounts', icon: 'Link2', roles: ['admin', 'editor', 'member'], group: 'Workspace' },
  { label: 'Team', href: '/dashboard/team', icon: 'Users', roles: ['admin'], group: 'Workspace' },
  {
    label: 'Connect',
    href: 'https://connect.nativpost.com',
    icon: 'ExternalLink',
    roles: ['admin', 'editor', 'member'],
    group: 'Workspace',
    external: true,
    planRequired: ['growth', 'pro', 'agency', 'enterprise'],
  },

  // --- Footer cluster (pinned above the avatar, no section header) ---
  {
    label: 'Earn 30% referral',
    href: 'https://nativpost.com/affiliates',
    icon: 'Gift',
    roles: ['admin', 'editor', 'member'],
    group: 'Account',
    external: true,
    footer: true,
  },
  { label: 'Support', href: '/dashboard/support', icon: 'LifeBuoy', roles: ['admin', 'editor', 'member'], group: 'Account', footer: true },
  { label: 'Settings', href: '/dashboard/settings', icon: 'Settings', roles: ['admin', 'editor', 'member'], group: 'Account', footer: true },
  { label: 'Billing', href: '/dashboard/billing', icon: 'CreditCard', roles: ['admin', 'member'], group: 'Account', footer: true },
];

// Groups for the scrolling main nav (footer items excluded — see getFooterNavForRole).
export function getNavForRole(role: UserRole): Record<string, NavItem[]> {
  const filtered = NAV_ITEMS.filter(item => item.roles.includes(role) && !item.footer);
  const grouped: Record<string, NavItem[]> = {};
  for (const item of filtered) {
    if (!grouped[item.group]) {
      grouped[item.group] = [];
    }
    grouped[item.group]!.push(item);
  }
  return grouped;
}

// Flat list of pinned footer links for the current role.
export function getFooterNavForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter(item => item.footer && item.roles.includes(role));
}
