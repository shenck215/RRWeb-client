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
	npmClient: "pnpm",
});
