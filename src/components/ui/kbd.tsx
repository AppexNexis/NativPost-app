import * as React from 'react';

import { cn } from '@/utils/Helpers';

/**
 * Keyboard-shortcut chip. Use inside buttons, tooltips, and menus to surface
 * shortcuts consistently (e.g. <Kbd>⌘K</Kbd>).
 */
const Kbd = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <kbd
      ref={ref}
      className={cn(
        'pointer-events-none inline-flex select-none items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  ),
);
Kbd.displayName = 'Kbd';

export { Kbd };
