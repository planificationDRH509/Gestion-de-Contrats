var _a;
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { localSqliteApiPlugin } from "./server/localSqliteApi";
var basePath = (_a = process.env.VITE_BASE_PATH) !== null && _a !== void 0 ? _a : "/";
export default defineConfig({
    base: basePath,
    plugins: [
        localSqliteApiPlugin(),
        react(),
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
            manifest: {
                name: "PLANIFICATION",
                short_name: "PLANIFICATION",
                description: "Rédaction, gestion et impression de contrats",
                theme_color: "#f7f5f2",
                background_color: "#f7f5f2",
                display: "standalone",
                scope: basePath,
                start_url: basePath,
                icons: [
                    {
                        src: "".concat(basePath, "icons/icon-192.png"),
                        sizes: "192x192",
                        type: "image/png"
                    },
                    {
                        src: "".concat(basePath, "icons/icon-512.png"),
                        sizes: "512x512",
                        type: "image/png"
                    }
                ]
            },
            workbox: {
                navigateFallback: "".concat(basePath, "index.html"),
                runtimeCaching: [
                    {
                        urlPattern: function (_a) {
                            var request = _a.request;
                            return request.destination === "document";
                        },
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "pages",
                            expiration: { maxEntries: 20 }
                        }
                    },
                    {
                        urlPattern: function (_a) {
                            var request = _a.request;
                            return ["style", "script", "worker"].includes(request.destination);
                        },
                        handler: "StaleWhileRevalidate",
                        options: {
                            cacheName: "assets",
                            expiration: { maxEntries: 50 }
                        }
                    },
                    {
                        urlPattern: function (_a) {
                            var request = _a.request;
                            return request.destination === "image";
                        },
                        handler: "CacheFirst",
                        options: {
                            cacheName: "images",
                            expiration: { maxEntries: 50 }
                        }
                    }
                ]
            }
        })
    ],
    server: {
        port: 5173
    }
});
