import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Video,
} from 'remotion';

interface SceneData {
  videoUrl: string;
  durationSec: number;
  transition: 'cut' | 'fade' | 'dissolve';
  description: string;
}

interface LongFormCompositionProps {
  title: string;
  scenes: SceneData[];
  voiceoverUrl?: string;
  bgMusicUrl?: string;
}

const TITLE_DURATION_SEC = 3;
const END_CARD_DURATION_SEC = 3;
const FPS = 30;

function FadeTransition({ children, durationFrames }: { children: React.ReactNode; durationFrames: number }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, durationFrames], [0, 1], { extrapolateRight: 'clamp' });
  return <div style={{ opacity }}>{children}</div>;
}

function TitleCard({ title }: { title: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 12 } });

  return (
    <AbsoluteFill style={{ backgroundColor: '#0D0D0D', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ transform: `scale(${scale})`, textAlign: 'center', padding: 40 }}>
        <h1 style={{
          fontSize: 72,
          fontWeight: 700,
          color: '#FFFFFF',
          fontFamily: 'system-ui, sans-serif',
          lineHeight: 1.2,
          maxWidth: 900,
        }}>
          {title}
        </h1>
      </div>
    </AbsoluteFill>
  );
}

function EndCard() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, fps * 0.5], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: '#0D0D0D', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ opacity, textAlign: 'center' }}>
        <p style={{ fontSize: 36, color: '#9b9b9b', fontFamily: 'system-ui, sans-serif' }}>
          Created with NativPost AI Studio
        </p>
      </div>
    </AbsoluteFill>
  );
}

export const LongFormComposition: React.FC<LongFormCompositionProps> = ({
  title,
  scenes,
  voiceoverUrl,
  bgMusicUrl,
}) => {
  const titleFrames = TITLE_DURATION_SEC * FPS;
  const endCardFrames = END_CARD_DURATION_SEC * FPS;

  let currentFrame = titleFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {/* Title card */}
      <Sequence from={0} durationInFrames={titleFrames}>
        <TitleCard title={title} />
      </Sequence>

      {/* Scenes */}
      {scenes.map((scene, i) => {
        const sceneFrames = scene.durationSec * FPS;
        const from = currentFrame;
        currentFrame += sceneFrames;

        // Transition overlap: previous scene fades out while next fades in
        const transitionFrames = scene.transition !== 'cut' ? Math.floor(FPS * 0.5) : 0;
        const adjustedFrom = from - transitionFrames;
        const adjustedDuration = sceneFrames + transitionFrames + (i < scenes.length - 1 ? transitionFrames : 0);

        return (
          <Sequence
            key={i}
            from={Math.max(0, adjustedFrom)}
            durationInFrames={adjustedDuration}
          >
            {scene.transition !== 'cut' ? (
              <FadeTransition durationFrames={transitionFrames}>
                <SceneClip scene={scene} index={i} />
              </FadeTransition>
            ) : (
              <SceneClip scene={scene} index={i} />
            )}
          </Sequence>
        );
      })}

      {/* End card */}
      <Sequence from={currentFrame} durationInFrames={endCardFrames}>
        <EndCard />
      </Sequence>

      {/* Audio tracks */}
      {voiceoverUrl && <Audio src={voiceoverUrl} />}
      {bgMusicUrl && <Audio src={bgMusicUrl} volume={0.3} />}
    </AbsoluteFill>
  );
};

function SceneClip({ scene, index }: { scene: SceneData; index: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isIntro = frame < fps * 0.3;
  const isOutro = frame > scene.durationSec * fps - fps * 0.3;
  const opacity = isIntro
    ? interpolate(frame, [0, fps * 0.3], [0, 1])
    : isOutro
    ? interpolate(frame, [scene.durationSec * fps - fps * 0.3, scene.durationSec * fps], [1, 0])
    : 1;

  return (
    <AbsoluteFill>
      <Video
        src={scene.videoUrl}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        muted
      />
      <div style={{
        position: 'absolute',
        bottom: 60,
        left: 40,
        right: 40,
        opacity,
      }}>
        <div style={{
          display: 'inline-block',
          backgroundColor: 'rgba(0,0,0,0.7)',
          color: '#e8e8e8',
          padding: '8px 16px',
          borderRadius: 8,
          fontSize: 20,
          fontFamily: 'system-ui, sans-serif',
        }}>
          <span style={{ color: '#f5c518', fontWeight: 700, marginRight: 8 }}>
            {index + 1}
          </span>
          {scene.description}
        </div>
      </div>
    </AbsoluteFill>
  );
}
