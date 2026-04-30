import React from 'react';
import { View, Platform } from 'react-native';
import {
  Svg,
  G,
  Path,
  Circle,
  Ellipse,
  Rect,
  Line,
} from 'react-native-svg';
import { useThemeColors } from '../theme/ThemeProvider';
import type { ColorPalette } from '../constants/colors';

/**
 * BikeVault — Apex icon system v1
 *
 * 28 icons × 2 states (line / fill) = 56 marks. Ported from the
 * `bikevault_icons.svg` sprite designed in the Apex brand session.
 *
 * Design rules (from the spec):
 * - 24-unit grid; renders cleanly at 24, 28, 32, 48, 56 px.
 * - Line variant: 2 px stroke, round caps + joins, no fill, currentColor.
 * - Fill variant: solid silhouette, optional Signal-red focal accent on
 *   the element that "earns" it (saddle dot, hub, alert triangle…).
 *
 * `currentColor` is mapped to the active text color (or the explicit
 * `color` prop). The Signal accent is mapped to the active theme accent
 * so the icons retint with the rest of the UI.
 *
 * Punched-hole interiors (inside cassette rings, settings circles) use
 * the active background color so they read as cut-outs on any surface.
 */

export type BikeIconName =
  // Navigation
  | 'garage'
  | 'bike'
  | 'parts'
  | 'wrench'
  | 'rides'
  | 'profile'
  // Actions
  | 'add'
  | 'search'
  | 'filter'
  | 'sort'
  | 'edit'
  | 'delete'
  | 'settings'
  | 'bell'
  | 'sync'
  // Components
  | 'frame'
  | 'fork'
  | 'wheel'
  | 'drivetrain'
  | 'brakes'
  | 'cockpit'
  | 'saddle'
  | 'chain'
  | 'cassette'
  | 'pedals'
  // Service states
  | 'due'
  | 'overdue'
  | 'complete';

export type BikeIconVariant = 'line' | 'fill';

interface Props {
  name: BikeIconName;
  variant?: BikeIconVariant;
  size?: number;
  /** Override the body color (default: theme text color). */
  color?: string;
  /** Override the focal accent (default: theme accent / Signal red). */
  accent?: string;
  /** Override the punched-hole color (default: theme bg). */
  hole?: string;
}

export default function BikeIcon({
  name,
  variant = 'line',
  size = 24,
  color,
  accent,
  hole,
}: Props) {
  const C = useThemeColors();
  const body = color ?? C.text;
  const focal = accent ?? C.accent;
  const punch = hole ?? C.bg;

  const Render = ICON_RENDERERS[name];
  if (!Render) return null;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Render
          variant={variant}
          color={body}
          accent={focal}
          hole={punch}
          C={C}
        />
      </Svg>
    </View>
  );
}

interface RProps {
  variant: BikeIconVariant;
  color: string;
  accent: string;
  hole: string;
  C: ColorPalette;
}

// ─── Icon path renderers ───────────────────────────────────────────────────
// Each renderer returns the inner SVG nodes for both states. The shared
// stroke discipline (2 px round) is enforced by passing strokeWidth=2,
// strokeLinecap='round', strokeLinejoin='round' to <G> wrappers.

const lineProps = {
  fill: 'none',
  strokeWidth: 2,
  strokeLinejoin: 'round' as const,
  strokeLinecap: 'round' as const,
};

const ICON_RENDERERS: Record<BikeIconName, React.FC<RProps>> = {
  // ── Garage: 4 squares ──
  garage: ({ variant, color, accent }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Rect x={4} y={4} width={7} height={7} rx={1.5} />
        <Rect x={13} y={4} width={7} height={7} rx={1.5} />
        <Rect x={4} y={13} width={7} height={7} rx={1.5} />
        <Rect x={13} y={13} width={7} height={7} rx={1.5} />
      </G>
    ) : (
      <G>
        <Rect x={4} y={4} width={7} height={7} rx={1.5} fill={color} />
        <Rect x={13} y={4} width={7} height={7} rx={1.5} fill={accent} />
        <Rect x={4} y={13} width={7} height={7} rx={1.5} fill={color} />
        <Rect x={13} y={13} width={7} height={7} rx={1.5} fill={color} />
      </G>
    ),

  // ── Bike: two wheels + frame ──
  bike: ({ variant, color, accent }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Circle cx={6} cy={17.5} r={3.5} />
        <Circle cx={18} cy={17.5} r={3.5} />
        <Circle cx={14.5} cy={5.5} r={1} />
        <Path d="M12 17.5V14L9 11L13 8L15 11H17" />
      </G>
    ) : (
      <G>
        <G stroke={color} fill="none" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round">
          <Circle cx={6} cy={17.5} r={3.5} />
          <Circle cx={18} cy={17.5} r={3.5} />
          <Path d="M12 17.5V14L9 11L13 8L15 11H17" />
        </G>
        <Circle cx={14.5} cy={5.5} r={1.6} fill={accent} />
      </G>
    ),

  // ── Parts: isometric storage crate ──
  parts: ({ variant, color, accent, hole }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Path d="M12 3 L20 7.5 L20 16.5 L12 21 L4 16.5 L4 7.5 Z" />
        <Path d="M4 7.5 L12 12 L20 7.5 M12 12 L12 21" />
      </G>
    ) : (
      <G>
        <Path d="M12 3 L20 7.5 L20 16.5 L12 21 L4 16.5 L4 7.5 Z" fill={color} />
        <Path
          d="M4 7.5 L12 12 L20 7.5 M12 12 L12 21"
          fill="none"
          stroke={hole}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle cx={10} cy={15.5} r={1.5} fill={accent} />
      </G>
    ),

  // ── Wrench ──
  wrench: ({ variant, color }) => (
    <Path
      d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"
      fill={variant === 'fill' ? color : 'none'}
      stroke={color}
      strokeWidth={variant === 'fill' ? 0 : 2}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  ),

  // ── Rides: line chart ──
  rides: ({ variant, color, accent }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Path d="M3 19 L9 13 L13 17 L21 9" />
        <Path d="M16 9 H21 V14" />
      </G>
    ) : (
      <G>
        <Path
          d="M3 19 L9 13 L13 17 L21 9"
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Path
          d="M16 9 H21 V14"
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle cx={21} cy={9} r={2.5} fill={accent} />
      </G>
    ),

  // ── Profile: head + shoulders ──
  profile: ({ variant, color }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Circle cx={12} cy={8} r={3.5} />
        <Path d="M5 20 a7 7 0 0 1 14 0" />
      </G>
    ) : (
      <G>
        <Circle cx={12} cy={8} r={3.5} fill={color} />
        <Path d="M5 20 a7 7 0 0 1 14 0 V21 H5 Z" fill={color} />
      </G>
    ),

  // ── Add: plus / filled circle plus ──
  add: ({ variant, color, accent }) =>
    variant === 'line' ? (
      <Path
        d="M12 5 V19 M5 12 H19"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    ) : (
      <G>
        <Circle cx={12} cy={12} r={9} fill={accent} />
        <Path
          d="M12 8 V16 M8 12 H16"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </G>
    ),

  // ── Search ──
  search: ({ variant, color, accent }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Circle cx={10.5} cy={10.5} r={6.5} />
        <Path d="M15.5 15.5 L20 20" />
      </G>
    ) : (
      <G>
        <G stroke={color} fill="none" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round">
          <Circle cx={10.5} cy={10.5} r={6.5} />
          <Path d="M15.5 15.5 L20 20" />
        </G>
        <Circle cx={10.5} cy={10.5} r={3} fill={accent} />
      </G>
    ),

  // ── Filter ──
  filter: ({ variant, color }) => (
    <Path
      d="M4 5 H20 L14 13 V20 L10 18 V13 Z"
      fill={variant === 'fill' ? color : 'none'}
      stroke={color}
      strokeWidth={variant === 'fill' ? 0 : 2}
      strokeLinejoin="round"
    />
  ),

  // ── Sort ──
  sort: ({ variant, color }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Path d="M8 6 V19 M5 9 L8 6 L11 9" />
        <Path d="M16 18 V5 M13 15 L16 18 L19 15" />
      </G>
    ) : (
      <G fill={color}>
        <Path d="M8 4 L4 9 H7 V20 H9 V9 H12 Z" />
        <Path d="M16 20 L20 15 H17 V4 H15 V15 H12 Z" />
      </G>
    ),

  // ── Edit: pencil ──
  edit: ({ variant, color, accent }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        <Path d="M15 5 L19 9" />
      </G>
    ) : (
      <G>
        <Path
          d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"
          fill={color}
        />
        <Path
          d="M15 5 L19 9"
          fill="none"
          stroke={accent}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      </G>
    ),

  // ── Delete: trash ──
  delete: ({ variant, color, accent }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Path d="M3 6 H21" />
        <Path d="M8 6 V4 a1 1 0 0 1 1 -1 H15 a1 1 0 0 1 1 1 V6" />
        <Path d="M5 6 V20 a2 2 0 0 0 2 2 H17 a2 2 0 0 0 2 -2 V6" />
        <Path d="M10 11 V17 M14 11 V17" />
      </G>
    ) : (
      <G>
        <Path d="M5 6 V20 a2 2 0 0 0 2 2 H17 a2 2 0 0 0 2 -2 V6 Z" fill={color} />
        <Path
          d="M8 6 V4 a1 1 0 0 1 1 -1 H15 a1 1 0 0 1 1 1 V6"
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Rect x={3} y={5} width={18} height={2} rx={1} fill={color} />
        <G stroke={accent} strokeWidth={1.6} strokeLinecap="round" fill="none">
          <Path d="M10 11 V17 M14 11 V17" />
        </G>
      </G>
    ),

  // ── Settings: sliders ──
  settings: ({ variant, color, accent, hole }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Path d="M3 6 H21 M3 12 H21 M3 18 H21" />
        <Circle cx={9} cy={6} r={2} fill={hole} />
        <Circle cx={15} cy={12} r={2} fill={hole} />
        <Circle cx={7} cy={18} r={2} fill={hole} />
      </G>
    ) : (
      <G>
        <G stroke={color} fill="none" strokeWidth={2} strokeLinecap="round">
          <Path d="M3 6 H21 M3 12 H21 M3 18 H21" />
        </G>
        <Circle cx={9} cy={6} r={2.2} fill={color} />
        <Circle cx={15} cy={12} r={2.2} fill={accent} />
        <Circle cx={7} cy={18} r={2.2} fill={color} />
      </G>
    ),

  // ── Bell ──
  bell: ({ variant, color, accent }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Path d="M6 8 a6 6 0 0 1 12 0 c0 7 3 9 3 9 H3 s3 -2 3 -9" />
        <Path d="M10.3 21 a2 2 0 0 0 3.4 0" />
      </G>
    ) : (
      <G>
        <Path d="M6 8 a6 6 0 0 1 12 0 c0 7 3 9 3 9 H3 s3 -2 3 -9 Z" fill={color} />
        <Path
          d="M10.3 21 a2 2 0 0 0 3.4 0"
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <Circle cx={18} cy={6} r={2.6} fill={accent} />
      </G>
    ),

  // ── Sync: refresh arrow ──
  sync: ({ variant, color, accent }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Path d="M21 12 A9 9 0 1 1 12 3" />
        <Path d="M21 3 V8 H16" />
      </G>
    ) : (
      <G>
        <Path
          d="M21 12 A9 9 0 1 1 12 3"
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Path
          d="M21 3 V8 H16"
          fill="none"
          stroke={accent}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </G>
    ),

  // ── Frame: triangle on baseline ──
  frame: ({ variant, color }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Path d="M9 8 L18 8 L11 18 Z" />
        <Path d="M11 18 L4 18 M11 18 L20 18" />
      </G>
    ) : (
      <G>
        <Path d="M9 8 L18 8 L11 18 Z" fill={color} />
        <Rect x={4} y={17} width={16} height={2} rx={1} fill={color} />
      </G>
    ),

  // ── Fork ──
  fork: ({ variant, color }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Path d="M12 3 V10 M12 10 L7 19 M12 10 L17 19" />
        <Path d="M9 3 H15" />
      </G>
    ) : (
      <Path
        d="M9 2 H15 V4 H13 V10.5 L18 19.5 L16 21 L12 12 L8 21 L6 19.5 L11 10.5 V4 H9 Z"
        fill={color}
      />
    ),

  // ── Wheel: spoked circle ──
  wheel: ({ variant, color, accent }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Circle cx={12} cy={12} r={9} />
        <Circle cx={12} cy={12} r={2} />
        <Path d="M12 3 V21 M3 12 H21" />
      </G>
    ) : (
      <G>
        <Circle cx={12} cy={12} r={9} fill={color} />
        <G stroke="#FFFFFF" strokeWidth={1.5} fill="none" strokeLinecap="round" opacity={0.95}>
          <Path d="M12 4 V20 M4 12 H20" />
        </G>
        <Circle cx={12} cy={12} r={2.2} fill={accent} />
      </G>
    ),

  // ── Drivetrain: chainring ──
  drivetrain: ({ variant, color, accent, hole }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Circle cx={12} cy={12} r={7} />
        <Circle cx={12} cy={12} r={2.5} />
        <Path d="M12 5 V7 M19 12 H17 M12 19 V17 M5 12 H7 M16.95 7.05 L15.5 8.5 M16.95 16.95 L15.5 15.5 M7.05 16.95 L8.5 15.5 M7.05 7.05 L8.5 8.5" />
      </G>
    ) : (
      <G>
        <Circle cx={12} cy={12} r={7.5} fill={color} />
        <Circle cx={12} cy={12} r={2.5} fill={hole} />
        <Circle cx={12} cy={12} r={1} fill={accent} />
      </G>
    ),

  // ── Brakes: caliper + pad ──
  brakes: ({ variant, color, accent }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Path d="M5 5 a8 8 0 0 1 7 7" />
        <Path d="M19 5 a8 8 0 0 0 -7 7" />
        <Path d="M5 5 L3 7 M19 5 L21 7" />
        <Circle cx={12} cy={14} r={2} />
        <Path d="M12 16 V21" />
      </G>
    ) : (
      <G>
        <G stroke={color} fill="none" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round">
          <Path d="M5 5 a8 8 0 0 1 7 7" />
          <Path d="M19 5 a8 8 0 0 0 -7 7" />
          <Path d="M5 5 L3 7 M19 5 L21 7" />
          <Path d="M12 16 V21" />
        </G>
        <Circle cx={12} cy={14} r={2.5} fill={accent} />
      </G>
    ),

  // ── Cockpit: handlebar ──
  cockpit: ({ variant, color, accent }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Path d="M3 8 H21" />
        <Path d="M3 8 L3 13 M21 8 L21 13" />
        <Path d="M12 8 V18" />
        <Circle cx={12} cy={20} r={1.5} />
      </G>
    ) : (
      <G>
        <G fill={color}>
          <Rect x={2} y={6.75} width={20} height={2.5} rx={1.25} />
          <Rect x={1.75} y={6.75} width={2.5} height={7.5} rx={1.25} />
          <Rect x={19.75} y={6.75} width={2.5} height={7.5} rx={1.25} />
          <Rect x={11} y={9.25} width={2} height={9.5} />
        </G>
        <Circle cx={12} cy={20} r={2} fill={accent} />
      </G>
    ),

  // ── Saddle ──
  saddle: ({ variant, color }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Path d="M3 11 Q3 7 8 7 L17 7 Q22 7 22 11 Q22 14 17 14 L8 14 Q3 14 3 11 Z" />
        <Path d="M12 14 V21" />
      </G>
    ) : (
      <G>
        <Path
          d="M3 11 Q3 7 8 7 L17 7 Q22 7 22 11 Q22 14 17 14 L8 14 Q3 14 3 11 Z"
          fill={color}
        />
        <Path
          d="M12 14 V21"
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </G>
    ),

  // ── Chain: three links ──
  chain: ({ variant, color, accent, hole }) =>
    variant === 'line' ? (
      <G stroke={color} fill="none" strokeWidth={2} strokeLinejoin="round">
        <Ellipse cx={6} cy={12} rx={3} ry={4} />
        <Ellipse cx={12} cy={12} rx={3} ry={4} />
        <Ellipse cx={18} cy={12} rx={3} ry={4} />
      </G>
    ) : (
      <G>
        <Ellipse cx={6} cy={12} rx={3} ry={4} fill={color} />
        <Ellipse cx={6} cy={12} rx={1.2} ry={2} fill={hole} />
        <Ellipse cx={12} cy={12} rx={3} ry={4} fill={accent} />
        <Ellipse cx={12} cy={12} rx={1.2} ry={2} fill={hole} />
        <Ellipse cx={18} cy={12} rx={3} ry={4} fill={color} />
        <Ellipse cx={18} cy={12} rx={1.2} ry={2} fill={hole} />
      </G>
    ),

  // ── Cassette: concentric rings ──
  cassette: ({ variant, color, accent, hole }) =>
    variant === 'line' ? (
      <G stroke={color} fill="none" strokeWidth={2}>
        <Circle cx={12} cy={12} r={9} />
        <Circle cx={12} cy={12} r={6} />
        <Circle cx={12} cy={12} r={3} />
      </G>
    ) : (
      <G>
        <Circle cx={12} cy={12} r={9} fill={color} />
        <Circle cx={12} cy={12} r={6.5} fill={hole} />
        <Circle cx={12} cy={12} r={5} fill={color} />
        <Circle cx={12} cy={12} r={3.2} fill={hole} />
        <Circle cx={12} cy={12} r={1.8} fill={accent} />
      </G>
    ),

  // ── Pedals ──
  pedals: ({ variant, color, accent }) =>
    variant === 'line' ? (
      <G stroke={color} fill="none" strokeWidth={2} strokeLinejoin="round">
        <Rect x={4} y={9} width={16} height={6} rx={1.5} />
        <Circle cx={12} cy={12} r={1.5} />
        <Path d="M7 9 V15 M17 9 V15" />
      </G>
    ) : (
      <G>
        <Rect x={4} y={9} width={16} height={6} rx={1.5} fill={color} />
        <Circle cx={12} cy={12} r={1.8} fill={accent} />
      </G>
    ),

  // ── Due: clock ──
  due: ({ variant, color, hole }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Circle cx={12} cy={12} r={9} />
        <Path d="M12 7 V12 L15 14" />
      </G>
    ) : (
      <G>
        <Circle cx={12} cy={12} r={9} fill={color} />
        <Path
          d="M12 7 V12 L15 14"
          fill="none"
          stroke={hole}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </G>
    ),

  // ── Overdue: triangle alert ──
  overdue: ({ variant, color, accent }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Path d="M12 3 L22 20 H2 Z" />
        <Path d="M12 10 V14" />
        <Circle cx={12} cy={17} r={0.6} fill={color} stroke="none" />
      </G>
    ) : (
      <G>
        <Path d="M12 3 L22 20 H2 Z" fill={accent} />
        <G stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" fill="none">
          <Path d="M12 10 V14" />
        </G>
        <Circle cx={12} cy={17} r={0.9} fill="#FFFFFF" />
      </G>
    ),

  // ── Complete: check circle ──
  complete: ({ variant, color, accent }) =>
    variant === 'line' ? (
      <G stroke={color} {...lineProps}>
        <Circle cx={12} cy={12} r={9} />
        <Path d="M7 12 L11 16 L17 9" />
      </G>
    ) : (
      <G>
        <Circle cx={12} cy={12} r={9} fill={accent} />
        <Path
          d="M7 12 L11 16 L17 9"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </G>
    ),
};

// Suppress unused-import lints on platforms where Line isn't used.
void Line;
void Platform;
