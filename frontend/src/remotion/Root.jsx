import { Composition } from "remotion";
import { MorpheusIntro } from "./MorpheusIntro.jsx";

export const RemotionRoot = () => {
  return (
    <Composition
      id="MorpheusIntro"
      component={MorpheusIntro}
      durationInFrames={1620}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
