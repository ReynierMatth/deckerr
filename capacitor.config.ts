import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO: change this reverse-DNS id if you publish under a different domain.
  // It becomes the Android applicationId and is permanent once on the Play
  // Store, so pick it before your first release.
  appId: 'io.github.reyniermatth.deckerr',
  appName: 'Deckerr',
  // Vite builds the web app into dist/; Capacitor copies dist/ into the
  // native project on every `cap sync`.
  webDir: 'dist',
  android: {
    // Serve the bundled app over https://localhost (Capacitor default).
    // Relative fetches (e.g. the CV art-index at `/card-art-index.bin`)
    // resolve against this origin and are served from the APK's assets.
    // A secure origin is REQUIRED for getUserMedia (camera) + WebGPU.
    //
    // allowMixedContent stays FALSE: instances MUST be served over HTTPS.
    // Do NOT enable cleartext unless you knowingly need to reach a plain-HTTP
    // dev instance — see the manifest usesCleartextTraffic note in the report.
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
