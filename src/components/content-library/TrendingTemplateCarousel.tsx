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
    //
    // Sizing tuned to match the usefastlane reference: 5 cards visible in the
    // fan (center + 2 on each side stepped back), each card at ~180px wide so
    // the phone silhouette reads clearly without cramping. max-w bumped so
    // the two edge cards don't clip on 1280px+ viewports.
    <div className="mx-auto w-full max-w-[960px] overflow-x-hidden py-10">
      <Swiper
        effect="coverflow"
        modules={[EffectCoverflow, Autoplay]}
        grabCursor
        centeredSlides
        slidesPerView="auto"
        spaceBetween={4}
        loop={templates.length >= 5}
        autoplay={
          autoplay
            ? {
                delay: 5000,
                pauseOnMouseEnter: true,
                disableOnInteraction: false,
              }
            : false
        }
        // Fan-stack tuned for a 5-card spread. Higher stretch pulls neighbors
        // in so five cards read as a cohesive fan; deeper depth gives the
        // back-row cards clear separation without shrinking them past
        // legibility.
        coverflowEffect={{
          rotate: 0,
          stretch: 60,
          depth: 200,
          modifier: 1.4,
          slideShadows: false,
        }}
      >
        {templates.map((template) => (
          <SwiperSlide
            key={template.id}
            className="!h-auto !w-[200px] sm:!w-[220px]"
          >
            <TemplateCard template={template} onRemix={onRemix} />
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
