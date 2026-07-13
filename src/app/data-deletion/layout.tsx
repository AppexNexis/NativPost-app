import '@/styles/global.css';

/**
 * Root layout for /data-deletion (public, no auth, no i18n).
 *
 * This page sits outside the [locale] group, so Next.js requires it to have
 * its own root layout — the [locale]/layout.tsx html/body wrapper cannot be
 * shared across sibling app-router branches.
 *
 * Kept minimal on purpose: Meta's data-deletion callback lands here without
 * a session, so we skip the theme cookie script and the NextIntlClientProvider.
 */
export default function DataDeletionRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
