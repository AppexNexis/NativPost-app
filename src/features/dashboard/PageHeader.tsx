type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      {/* min-w-0 + break-words so a long title never pushes actions off-screen at 375px. */}
      <div className="min-w-0 flex-1">
        <h1 className="break-words font-display text-title">{title}</h1>
        {description && (
          <p className="mt-1 break-words text-body text-muted-foreground">{description}</p>
        )}
      </div>
      {/* flex-wrap lets multi-button action rows drop to a second line on narrow viewports. */}
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
