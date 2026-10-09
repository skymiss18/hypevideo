import { Composition } from "remotion";
import { VIDEO_FPS, VIDEO_HEIGHT, VIDEO_WIDTH, type Storyboard } from "../shared/types";
import { Journey, type JourneyProps } from "./Journey";
import { sampleStoryboard } from "./sample";

export const COMPOSITION_ID = "Journey";

export const Root: React.FC = () => (
  <Composition
    id={COMPOSITION_ID}
    component={Journey}
    fps={VIDEO_FPS}
    width={VIDEO_WIDTH}
    height={VIDEO_HEIGHT}
    durationInFrames={sampleStoryboard.totalFrames}
    defaultProps={{ storyboard: sampleStoryboard } satisfies JourneyProps}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, (props.storyboard as Storyboard).totalFrames) })}
  />
);
