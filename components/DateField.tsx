import React from 'react';
import { Platform, TextInput, StyleProp, TextStyle } from 'react-native';
import dayjs from 'dayjs';
import { Colors } from '../constants/colors';

interface Props {
  /** Timestamp in ms. */
  value: number;
  onChange: (timestamp: number) => void;
  /** Optional upper-bound timestamp (e.g. Date.now() to disallow future dates). */
  maxDate?: number;
  /** Horizontal alignment of the displayed date. Defaults to 'left'. */
  align?: 'left' | 'right';
  /** Text colour. Defaults to Colors.text. Use Colors.accent to match
   * numeric value rows in forms. */
  color?: string;
  /** Font weight. Defaults to 'normal'. */
  fontWeight?: TextStyle['fontWeight'];
  /** Extra native-only style overrides (TextInput). */
  style?: StyleProp<TextStyle>;
}

/**
 * Cross-platform date input.
 *
 * On web we render an actual `<input type="date">` via
 * React.createElement so react-native-web doesn't try to wrap it — the
 * browser's native date picker is the nicest UX and avoids pulling in
 * a native-only library like `@react-native-community/datetimepicker`
 * just for the web build.
 *
 * On native we fall back to a plain TextInput with a `YYYY-MM-DD`
 * format hint. If/when native dates become important we can swap this
 * one place for a proper wheel picker.
 */
export default function DateField({
  value,
  onChange,
  maxDate,
  align = 'left',
  color = Colors.text,
  fontWeight = 'normal',
  style,
}: Props) {
  if (Platform.OS === 'web') {
    return React.createElement('input', {
      type: 'date',
      value: dayjs(value).format('YYYY-MM-DD'),
      max: maxDate ? dayjs(maxDate).format('YYYY-MM-DD') : undefined,
      onChange: (e: { target: { value: string } }) => {
        const v = e.target.value;
        if (!v) return;
        // Split + build at local noon so DST / tz edges don't bump the
        // displayed date back by a day.
        const [y, m, d] = v.split('-').map(Number);
        onChange(new Date(y, m - 1, d, 12, 0, 0).getTime());
      },
      style: {
        fontSize: 15,
        fontWeight,
        color,
        backgroundColor: 'transparent',
        border: 'none',
        outline: 'none',
        padding: 0,
        fontFamily: 'inherit',
        textAlign: align,
        // Intrinsic width — matches the numeric inputs in the same
        // row which size to their content, not flex-grow.
        minWidth: 130,
      },
    });
  }

  // Native fallback.
  const [text, setText] = React.useState(dayjs(value).format('YYYY-MM-DD'));
  React.useEffect(() => setText(dayjs(value).format('YYYY-MM-DD')), [value]);

  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onBlur={() => {
        const d = dayjs(text);
        if (d.isValid()) {
          const capped = maxDate ? Math.min(d.valueOf(), maxDate) : d.valueOf();
          onChange(capped);
          setText(dayjs(capped).format('YYYY-MM-DD'));
        } else {
          setText(dayjs(value).format('YYYY-MM-DD'));
        }
      }}
      placeholder="YYYY-MM-DD"
      placeholderTextColor={Colors.textTertiary}
      style={[
        {
          fontSize: 15,
          fontWeight,
          color,
          minWidth: 130,
          textAlign: align,
        },
        style,
      ]}
    />
  );
}
