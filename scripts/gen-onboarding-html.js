// Read the source HTML, apply small modifications for in-app use,
// and emit a TypeScript module that exports it as a string constant.
const fs = require('fs');
const path = require('path');

const SRC = '/sessions/sharp-blissful-fermi/mnt/BikeVault/bikevault_onboarding.html';
const DST = '/sessions/sharp-blissful-fermi/mnt/BikeVault/constants/onboardingHtml.ts';

let html = fs.readFileSync(SRC, 'utf8');

// 1) Hide dev chrome — Replay button, progress bar, scene legend.
//    Inject the rule just before </head>.
const HIDE_RULE = `<style>.replay,.progress,.legend{display:none!important}</style>`;
if (!html.includes(HIDE_RULE)) {
  html = html.replace('</head>', HIDE_RULE + '\n</head>');
}

// 2) Add a postMessage at the end of each cycle so the host modal can
//    detect that the user has seen the full onboarding. Auto-loop is
//    preserved so users who don't dismiss see it again.
//    Find: `else setTimeout(play, 1400);` and inject the message hook.
html = html.replace(
  'else setTimeout(play, 1400);',
  `else {
        try {
          var msg = JSON.stringify({ type: 'onboarding-cycle-done' });
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(msg);
          } else if (window.parent && window.parent !== window) {
            window.parent.postMessage(msg, '*');
          }
        } catch (e) { /* noop */ }
        setTimeout(play, 1400);
      }`
);

// 3) Emit the TS module. Use JSON.stringify to guarantee a valid JS
//    string literal regardless of quotes / template literals inside.
const ts =
  '// AUTO-GENERATED from bikevault_onboarding.html. Do not edit by hand —\n' +
  '// regenerate with: node scripts/gen-onboarding-html.js\n' +
  '//\n' +
  '// The host modal loads this string via react-native-webview\n' +
  '// (native) or an iframe srcDoc (web). The HTML has been patched to\n' +
  '// hide its dev chrome and to postMessage `{type:"onboarding-cycle-done"}`\n' +
  '// at the end of each full cycle.\n\n' +
  'export const ONBOARDING_HTML = ' + JSON.stringify(html) + ';\n';

fs.writeFileSync(DST, ts);
console.log('Wrote', DST, '—', ts.length, 'chars');
