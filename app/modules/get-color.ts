import Vibrant from "node-vibrant";
import { shade } from "polished";
import { hex } from "wcag-contrast";

export const getColor = async (path?: string) => {
  let color = defaultColor;

  try {
    if (path) {
      if (path.match(/\.(jpg|jpeg|png)$/)) {
        await Vibrant.from(path).getPalette((_err, palette) => {
          if (palette?.Vibrant) {
            let detectedHex = palette.Vibrant.hex;
            let AAscore = hex(detectedHex, "#FFF");

            while (AAscore < 3) {
              detectedHex = shade(0.005, detectedHex);
              AAscore = hex(detectedHex, "#FFF");
            }

            color = detectedHex;
          }
        });
      }
    }
  } catch (error) {
    console.log(`Couldn't get color from ${path}`);
  } finally {
    return new Response(color, {
      headers: {
        "content-type": "text/plain;charset=UTF-8",
        ...(color !== defaultColor && {
          "Cache-Control": "public, max-age=14400",
          "CDN-Cache-Control": "public, max-age=31536000",
        }),
      },
      status: 200,
    });
  }
};

export const defaultColor = "#2172E5";
