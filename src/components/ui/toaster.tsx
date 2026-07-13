'use client';

import { Toaster as SonnerToaster } from 'sonner';

type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

/**
 * Pre-configured Sonner toaster for the NativPost dashboard.
 *
 * Drop <Toaster /> once at the dashboard layout root. Then call
 * `import { toast } from 'sonner'` from any client component:
 *
 *   toast.success('Approved');
 *   toast.error('Something went wrong');
 *   toast('Copied to clipboard');
 */
export function Toaster({ ...props }: ToasterProps) {
  return (
    <SonnerToaster
      className="pointer-events-auto"
      richColors
      closeButton
      position="bottom-right"
      toastOptions={{
        duration: 4_000,
      }}
      {...props}
    />
  );
}
