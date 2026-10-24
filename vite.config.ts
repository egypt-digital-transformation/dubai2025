import { cpSync, createReadStream, statSync, copyFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig, type Plugin } from 'vitest/config';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const sourceRoot = resolve(projectRoot, 'src');
const outputRoot = resolve(projectRoot, 'www');
const assetsRoot = resolve(sourceRoot, 'assets');
const flagsRoot = resolve(projectRoot, 'node_modules/flag-icons/flags/4x3');
const productionEnvironment = resolve(sourceRoot, 'environments/environment.prod.ts');

const contentTypes: Record<string, string> = {
  '.js': 'text/javascript',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function staticAssetsPlugin(): Plugin {
  return {
    name: 'app-static-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          next();
          return;
        }

        let pathname: string;
        try {
          pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
        } catch (error) {
          next(error);
          return;
        }

        let filePath: string | undefined;
        if (pathname.startsWith('/assets/')) {
          filePath = resolve(assetsRoot, pathname.slice('/assets/'.length));
          if (!filePath.startsWith(`${assetsRoot}${sep}`)) {
            next();
            return;
          }
        } else if (pathname.startsWith('/flags/4x3/')) {
          filePath = resolve(flagsRoot, pathname.slice('/flags/4x3/'.length));
          if (!filePath.startsWith(`${flagsRoot}${sep}`)) {
            next();
            return;
          }
        } else if (pathname === '/manifest.webmanifest') {
          filePath = resolve(sourceRoot, 'manifest.webmanifest');
        } else if (pathname === '/firebase-messaging-sw.js') {
          filePath = resolve(sourceRoot, 'firebase-messaging-sw.js');
        } else {
          next();
          return;
        }

        try {
          if (!statSync(filePath).isFile()) {
            next();
            return;
          }
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            next();
            return;
          }
          next(error);
          return;
        }

        response.setHeader(
          'Content-Type',
          contentTypes[extname(filePath)] ?? 'application/octet-stream',
        );
        if (request.method === 'HEAD') {
          response.end();
          return;
        }

        createReadStream(filePath).on('error', next).pipe(response);
      });
    },
    apply: 'build',
    closeBundle() {
      cpSync(assetsRoot, resolve(outputRoot, 'assets'), { recursive: true });
      cpSync(flagsRoot, resolve(outputRoot, 'flags/4x3'), { recursive: true });
      copyFileSync(
        resolve(sourceRoot, 'manifest.webmanifest'),
        resolve(outputRoot, 'manifest.webmanifest'),
      );
      copyFileSync(
        resolve(sourceRoot, 'firebase-messaging-sw.js'),
        resolve(outputRoot, 'firebase-messaging-sw.js'),
      );
    },
  };
}

export default defineConfig(({ mode }) => ({
  root: sourceRoot,
  cacheDir: resolve(projectRoot, 'node_modules/.vite'),
  publicDir: false,
  plugins: [
    angular(),
    staticAssetsPlugin(),
  ],
  resolve: {
    alias: mode === 'production'
      ? [
          {
            find: resolve(sourceRoot, 'environments/environment.ts'),
            replacement: productionEnvironment,
          },
        ]
      : [],
  },
  build: {
    outDir: outputRoot,
    emptyOutDir: true,
    sourcemap: mode !== 'production',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    globals: true,
    setupFiles: ['../testing/app/test-setup.ts'],
    environment: 'jsdom',
    include: ['../testing/app/**/*.spec.ts'],
    server: {
      deps: {
        inline: [/rxfire/, /@ionic/, /@angular\/fire/],
      },
    },
  },
}));
