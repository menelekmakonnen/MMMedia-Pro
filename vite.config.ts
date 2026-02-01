import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

// Force unset ELECTRON_RUN_AS_NODE to ensure Electron launches in browser mode
delete process.env.ELECTRON_RUN_AS_NODE
console.log('[Vite] Unset ELECTRON_RUN_AS_NODE')

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        electron([
            {
                // Main-Process entry file of the Electron App.
                entry: 'electron/main.ts',
                vite: {
                    build: {
                        rollupOptions: {
                            external: ['electron'],
                            output: {
                                format: 'cjs',
                                entryFileNames: '[name].js',
                            }
                        }
                    }
                }
            },
            {
                entry: 'electron/preload.ts',
                onstart(options) {
                    // Notify the Renderer-Process to reload the page when the Preload-Script build is complete. 
                    options.reload()
                },
                vite: {
                    build: {
                        rollupOptions: {
                            external: ['electron'],
                            output: {
                                format: 'cjs',
                                entryFileNames: '[name].js',
                            }
                        }
                    }
                }
            },
        ]),
        renderer(),
    ],
    base: './',
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        host: '127.0.0.1',
        port: 7171,
        strictPort: true,
    }
})
