import React from 'react';
import { Svg, Path } from 'react-native-svg';

type Props = {
  /** Rendered width/height in px (the mark is square). */
  size?: number;
  /** Fill of the mark. Defaults to the signal-red brand accent. */
  color?: string;
};

/**
 * BikeVault brand mark — the offset "chevron" used as the app icon, native
 * splash (assets/splash.png), favicon and PWA icons. It is the single source
 * of truth for the in-app logo so the loading screen and login screen match
 * the home-screen / installed icon exactly.
 *
 * Geometry mirrors bikevault_icon_master.svg: a diagonal slash split by a
 * horizontal notch into two parallelograms. Here the notch is rendered as a
 * transparent gap (rather than a background-coloured rectangle) so the mark
 * reads correctly on any background and in either theme.
 */
export default function BrandMark({ size = 56, color = '#FF4936' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="248 248 528 528">
      {/* upper parallelogram (notch top at y=489) */}
      <Path d="M558.5 256 L768 256 L630.35 489 L420.85 489 Z" fill={color} />
      {/* lower parallelogram (notch bottom at y=536) */}
      <Path d="M393.07 536 L602.57 536 L465.5 768 L256 768 Z" fill={color} />
    </Svg>
  );
}
