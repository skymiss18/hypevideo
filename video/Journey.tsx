import { AbsoluteFill, Series } from "remotion";
import type { Scene, Storyboard } from "../shared/types";
import { Background, type SubtitleLanguage } from "./Common";
import { Drawdown, Equity } from "./CurveScenes";
import { Intro, Outro } from "./IntroOutro";
import { Trade } from "./TradeScene";

export interface JourneyProps extends Record<string, unknown> {
  storyboard: Storyboard;
  subtitleLanguage?: SubtitleLanguage;
}

const renderScene = (scene: Scene, hide: boolean, subtitleLanguage: SubtitleLanguage) => {
  switch (scene.type) {
    case "intro":
      return <Intro scene={scene} subtitleLanguage={subtitleLanguage} />;
    case "equity":
      return <Equity scene={scene} hide={hide} subtitleLanguage={subtitleLanguage} />;
    case "trade":
      return <Trade scene={scene} hide={hide} subtitleLanguage={subtitleLanguage} />;
    case "drawdown":
      return <Drawdown scene={scene} hide={hide} subtitleLanguage={subtitleLanguage} />;
    case "outro":
      return <Outro scene={scene} subtitleLanguage={subtitleLanguage} />;
  }
};

export const Journey: React.FC<JourneyProps> = ({ storyboard, subtitleLanguage = "en" }) => (
  <AbsoluteFill>
    <Background />
    <Series>
      {storyboard.scenes.map((scene) => (
        <Series.Sequence key={scene.id} durationInFrames={scene.durationInFrames}>
          {renderScene(scene, storyboard.hideAmounts, subtitleLanguage)}
        </Series.Sequence>
      ))}
    </Series>
  </AbsoluteFill>
);
