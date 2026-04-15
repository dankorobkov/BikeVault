import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// This file controls the HTML shell for web builds.
// Injecting the Ionicons @font-face here ensures icons render correctly on web.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        {/* Required for expo-router scroll views to work correctly on web */}
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: iconFontStyles }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const iconFontStyles = `
@font-face {
  font-family: Ionicons;
  src: url(${require('../assets/fonts/Ionicons.ttf')});
  font-weight: normal;
  font-style: normal;
}
`;
