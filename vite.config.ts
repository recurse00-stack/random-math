import { defineConfig } from "vite";

// LetsGal 程序扩展 = Vite ESM 库模式；react / react-dom / @avg-studio/sdk 由宿主提供单实例
export default defineConfig({
  build: {
    lib: {
      entry: "src/index.tsx",
      formats: ["es"],
      fileName: () => "index.js",
    },
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "@avg-studio/sdk"],
      output: { format: "es", entryFileNames: "index.js" },
    },
  },
});
