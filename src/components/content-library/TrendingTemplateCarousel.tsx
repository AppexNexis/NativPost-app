'use client';

/**
 * TrendingTemplateCarousel — stacked-card carousel of trending templates
 * powered by Swiper's `EffectCards`.
 *
 * Behavior
 *   - Cards effect: 3-card z-stack, tap side to advance
 *   - Autoplay 5000ms with `pauseOnMouseEnter` so hover-to-inspect never
 *     races the tick
 *   - Uses `TemplateCard` per slide so all card affordances (video hover
 *     autoplay, slideshow arrows, engagement pills, Remix CTA) stay in sync
 *     with the Content Library grid
 *
 * Phase 5d UI polish for the Create Post browse step. The parent
 * (`TrendingTemplateBrowser`) picks between grid and carousel based on how
 * many templates are returned.
 *
 * Note on styles: Swiper ships CSS modules that must be imported at least
 * once. We import them here so any consumer gets carousel styling without
 * a separate global include.
 */

import { Autoplay, EffectCards } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';

import 'swiper/css';
import 'swiper/css/effect-cards';

import type { ContentTemplate } from '@/types/v2';

import { TemplateCard } from './TemplateCard';

type Props = {
  templates: ContentTemplate[];
  onRemix: (template: ContentTemplate) => void;
};

export function TrendingTemplateCarousel({ templates, onRemix }: Props) {
  if (templates.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-[280px] py-6">
      <Swiper
        effect="cards"
        modules={[EffectCards, Autoplay]}
        grabCursor
        loop={templates.length > 2}
        autoplay={{
          delay: 5000,
          pauseOnMouseEnter: true,
          disableOnInteraction: false,
        }}
        cardsEffect={{
          slideShadows: false,
          perSlideOffset: 8,
          perSlideRotate: 2,
        }}
        className="!overflow-visible"
      >
        {templates.map((template) => (
          <SwiperSlide key={template.id} className="!h-auto">
            <TemplateCard template={template} onRemix={onRemix} />
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
