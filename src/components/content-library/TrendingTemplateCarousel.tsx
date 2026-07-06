'use client';

/**
 * TrendingTemplateCarousel — fan-stack / depth coverflow carousel of trending
 * templates powered by Swiper's `EffectCoverflow`.
 *
 * Behavior
 *   - Coverflow effect: center card scale(1) opacity(1); side cards pushed
 *     back with depth + stretch so they read as ~scale(0.88) opacity(0.6)
 *   - Autoplay 5000ms with `pauseOnMouseEnter` so hover-to-inspect never
 *     races the tick
 *   - Loop only when >=3 templates (Swiper needs multiples to loop cleanly)
 *   - Uses `TemplateCard` per slide so all card affordances (video hover
 *     autoplay, slideshow arrows, engagement pills, Remix CTA) stay in sync
 *     with the Content Library grid
 *
 * Phase 5d UI polish for the Create Post browse step, matching usefastlane's
 * Fan Stack / Depth Carousel pattern.
 */

import { Autoplay, EffectCoverflow } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';

import 'swiper/css';
import 'swiper/css/effect-coverflow';

import type { ContentTemplate } from '@/types/v2';

import { TemplateCard } from './TemplateCard';

type Props = {
  templates: ContentTemplate[];
  onRemix: (template: ContentTemplate) => void;
  autoplay?: boolean;
};

export function TrendingTemplateCarousel({ templates, onRemix, autoplay = true }: Props) {
  if (templates.length === 0) return null;

  return (
    // Wrapper clips horizontally so side cards can't paint outside — was
    // causing horizontal page scroll when Swiper's `!overflow-visible` let
    // wide fan-stack side slides bleed into siblings.
    <div className="mx-auto w-full max-w-[560px] overflow-x-hidden py-6">
      <Swiper
        effect="coverflow"
        modules={[EffectCoverflow, Autoplay]}
        grabCursor
        centeredSlides
        slidesPerView="auto"
        spaceBetween={12}
        loop={templates.length >= 3}
        autoplay={
          autoplay
            ? {
                delay: 5000,
                pauseOnMouseEnter: true,
                disableOnInteraction: false,
              }
            : false
        }
        // Tighter fan-stack: 2 cards visible (center + 1 partial peek) instead
        // of the previous 3-wide spread that overflowed on standard viewports.
        coverflowEffect={{
          rotate: 0,
          stretch: 20,
          depth: 120,
          modifier: 1,
          slideShadows: false,
        }}
      >
        {templates.map((template) => (
          <SwiperSlide
            key={template.id}
            className="!h-auto !w-[220px] sm:!w-[240px]"
          >
            <TemplateCard template={template} onRemix={onRemix} />
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
