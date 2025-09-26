module.exports = {
	es: true,
	lib: true,
	style: true,
	ts: true,
	coreJs: "3.31.0",
	tsConfig: {
		compilerOptions: {
			lib: ["DOM", "ES2017"],
		},
		typeRoots: [],
		paths: {
			"styled-components": ["./node_modules/styled-components"],
		},
	},
};
