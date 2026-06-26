"use client";

import { Coins, AlertCircle } from "lucide-react";

interface CreditBadgeProps {
  balance: number;
  estimate?: number;
}

export function CreditBadge({ balance, estimate }: CreditBadgeProps) {
  const low = balance < (estimate || 1);

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
        low
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-purple-200 bg-purple-50 text-purple-700"
      }`}
    >
      {low ? <AlertCircle className="h-3.5 w-3.5" /> : <Coins className="h-3.5 w-3.5" />}
      <span>{balance} credit{balance === 1 ? "" : "s"}</span>
      {estimate !== undefined && estimate > 0 && (
        <span className="text-muted-foreground">· {estimate} needed</span>
      )}
    </div>
  );
}
