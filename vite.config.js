import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';
import { copyFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    webExtension({
      manifest: './manifest.json',
      watchFilePaths: ['src/**/*', 'icons/**/*'],
      browser: 'firefox',
    }),
    {
      name: 'copy-icons',
      closeBundle() {
        const iconsDir = resolve(process.cwd(), 'dist/icons');
        mkdirSync(iconsDir, { recursive: true });

        const icons = ['icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-128.png'];
        icons.forEach(icon => {
          copyFileSync(
            resolve(process.cwd(), 'icons', icon),
            resolve(iconsDir, icon)
          );
        });
        console.log('Icons copied to dist/icons/');
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
