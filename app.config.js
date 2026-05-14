// Extends app.json so we can flip `experiments.baseUrl` based on the build
// environment. The test bundle is deployed at /test/ on Firebase Hosting, so
// every asset URL inside its index.html needs to be prefixed with /test —
// otherwise the test page would load prod's JS bundle from the root.
//
// Prod bundle deploys at root, so no baseUrl is needed.
//
// app.config.js receives the parsed app.json as `config` and we spread it
// through, preserving everything (icon, plugins, intentFilters, etc.).

module.exports = ({ config }) => {
  const isTest = process.env.EXPO_PUBLIC_APP_ENV === 'test';
  return {
    ...config,
    experiments: {
      ...(config.experiments || {}),
      ...(isTest ? { baseUrl: '/test' } : {}),
    },
  };
};
