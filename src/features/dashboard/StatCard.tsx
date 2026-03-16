import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export function StatCard({ icon: Icon, label, value, change, trend }: StatCardProps) {
  return (
    <div className="rounded-xl border bg-background p-5">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-semibold tracking-tight">{value}</p>
            {change && (
              <span
                className={`text-xs font-medium ${
                  trend === 'up'
                    ? 'text-green-600'
                    : trend === 'down'
                      ? 'text-red-500'
                      : 'text-muted-foreground'
                }`}
              >
                {change}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
