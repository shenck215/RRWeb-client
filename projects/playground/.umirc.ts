import { defineConfig } from "umi";

export default defineConfig({
	routes: [
		{
			path: "/",
			component: "@/layouts/basic",
			routes: [
				{ path: "/", component: "index" },
				{ path: "/form", component: "form" },
				{ path: "/replay", component: "replay" },
				{ path: "*", component: "404" },
			],
		},
	],
	plugins: ["@umijs/plugins/dist/styled-components"],
	styledComponents: {},
	monorepoRedirect: { srcDir: ["src"], peerDeps: true },
  mfsu: {
    shared: {
      react: { singleton: true },
      'react-dom': { singleton: true },
      'react/jsx-runtime': { singleton: true },
      'react/jsx-dev-runtime': { singleton: true },
    },
  },
	npmClient: "pnpm",
});
