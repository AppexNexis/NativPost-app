"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IMAGE_MODELS, VIDEO_MODELS } from "@/lib/ai-studio";

interface ModelSelectorProps {
  type: "image" | "video";
  value: string;
  onChange: (value: string) => void;
}

export function ModelSelector({ type, value, onChange }: ModelSelectorProps) {
  if (type === "image") {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-auto min-w-[160px] rounded-full border-gray-200 bg-white px-3 text-sm font-medium hover:border-purple-300">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {IMAGE_MODELS.map((opt) => (
            <SelectItem key={opt.id} value={opt.id} className="text-sm">
              <span className="font-medium">{opt.label}</span>
              <span className="ml-2 text-xs text-gray-400">{opt.creditsPerImage} credits/img</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-auto min-w-[160px] rounded-full border-gray-200 bg-white px-3 text-sm font-medium hover:border-purple-300">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {VIDEO_MODELS.map((opt) => (
          <SelectItem key={opt.id} value={opt.id} className="text-sm">
            <span className="font-medium">{opt.label}</span>
            <span className="ml-2 text-xs text-gray-400">
              {opt.creditsPerSecond === 0 ? "Free" : `${opt.creditsPerSecond} credits/sec`}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
