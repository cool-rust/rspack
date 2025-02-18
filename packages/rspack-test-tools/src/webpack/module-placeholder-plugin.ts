// @ts-nocheck
const {
	ConcatSource,
	RawSource,
	CachedSource,
	PrefixSource
} = require("webpack-sources");
const path = require("path");

function createRenderRuntimeModulesFn(Template) {
	return function renderRuntimeModules(runtimeModules, renderContext) {
		const source = new ConcatSource();
		for (const module of runtimeModules) {
			const codeGenerationResults = renderContext.codeGenerationResults;
			let runtimeSource;
			if (codeGenerationResults) {
				runtimeSource = codeGenerationResults.getSource(
					module,
					renderContext.chunk.runtime,
					"runtime"
				);
			} else {
				const codeGenResult = module.codeGeneration({
					chunkGraph: renderContext.chunkGraph,
					dependencyTemplates: renderContext.dependencyTemplates,
					moduleGraph: renderContext.moduleGraph,
					runtimeTemplate: renderContext.runtimeTemplate,
					runtime: renderContext.chunk.runtime,
					codeGenerationResults
				});
				if (!codeGenResult) continue;
				runtimeSource = codeGenResult.sources.get("runtime");
			}
			if (runtimeSource) {
				source.add(
					Template.toNormalComment(`start::${module.identifier()}`) + "\n"
				);
				if (!module.shouldIsolate()) {
					source.add(runtimeSource);
					source.add("\n\n");
				} else if (renderContext.runtimeTemplate.supportsArrowFunction()) {
					source.add("(() => {\n");
					source.add(new PrefixSource("\t", runtimeSource));
					source.add("\n})();\n\n");
				} else {
					source.add("!function() {\n");
					source.add(new PrefixSource("\t", runtimeSource));
					source.add("\n}();\n\n");
				}
				source.add(
					Template.toNormalComment(`end::${module.identifier()}`) + "\n"
				);
			}
		}
		return source;
	};
}

const caches = new WeakMap();

export function createModulePlaceholderPlugin(webpackPath) {
	const JavascriptModulesPlugin = require(path.join(
		path.dirname(webpackPath),
		"javascript/JavascriptModulesPlugin.js"
	));
	const Template = require(path.join(path.dirname(webpackPath), "Template.js"));
	Template.renderRuntimeModules = createRenderRuntimeModulesFn(Template);
	return {
		apply(compiler) {
			compiler.hooks.compilation.tap("RuntimeDiffPlugin", compilation => {
				const hooks = JavascriptModulesPlugin.getCompilationHooks(compilation);
				hooks.inlineInRuntimeBailout.tap(
					"RuntimeDiffPlugin",
					() => "not allow inline startup"
				);
				hooks.renderModulePackage.tap(
					"RuntimeDiffPlugin",
					(
						moduleSource,
						module,
						{ chunk, chunkGraph, moduleGraph, runtimeTemplate }
					) => {
						const { requestShortener } = runtimeTemplate;
						let cacheEntry;
						let cache = caches.get(requestShortener);
						if (cache === undefined) {
							caches.set(requestShortener, (cache = new WeakMap()));
							cache.set(
								module,
								(cacheEntry = {
									header: undefined,
									footer: undefined,
									full: new WeakMap()
								})
							);
						} else {
							cacheEntry = cache.get(module);
							if (cacheEntry === undefined) {
								cache.set(
									module,
									(cacheEntry = {
										header: undefined,
										footer: undefined,
										full: new WeakMap()
									})
								);
							} else {
								const cachedSource = cacheEntry.full.get(moduleSource);
								if (cachedSource !== undefined) return cachedSource;
							}
						}
						const source = new ConcatSource();
						let header = cacheEntry.header;
						let footer = cacheEntry.footer;
						if (header === undefined) {
							const req = module.readableIdentifier(requestShortener);
							const reqStr = req.replace(/\*\//g, "*_/");
							header = new RawSource(`\n/* start::${reqStr} */\n`);
							footer = new RawSource(`\n/* end::${reqStr} */\n`);
							cacheEntry.header = header;
							cacheEntry.footer = footer;
						}
						source.add(header);
						source.add(moduleSource);
						source.add(footer);
						const cachedSource = new CachedSource(source);
						cacheEntry.full.set(moduleSource, cachedSource);
						return cachedSource;
					}
				);
			});
		}
	};
}
