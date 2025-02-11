"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRegistry = getRegistry;
exports.registryResolveItemsTree = registryResolveItemsTree;
const handle_error_1 = require("../utils/handle-error");
const logger_1 = require("../utils/logger");
const schema_1 = require("./schema");
const registry_json_1 = __importDefault(require("./registry.json"));
const deepmerge_1 = __importDefault(require("deepmerge"));
function getRegistry() {
    try {
        const parsedRegistry = schema_1.registrySchema.parse(registry_json_1.default);
        return parsedRegistry;
    }
    catch (error) {
        logger_1.logger.break();
        (0, handle_error_1.handleError)(error);
    }
}
function resolveRegistryItems(names) {
    let registryDependencies = {};
    const registry = getRegistry();
    if (!registry)
        return;
    for (const name of names) {
        const itemRegistryDependencies = resolveRegistryDependencies(name, registry);
        registryDependencies = Object.assign(Object.assign({}, registryDependencies), itemRegistryDependencies);
    }
    return registryDependencies;
}
function resolveRegistryDependencies(name, registry) {
    const components = {};
    function resolveDependencies(componentName) {
        if (registry[componentName]) {
            components[componentName] = registry[componentName];
        }
        else {
            logger_1.logger.break();
            (0, handle_error_1.handleError)(`Component ${componentName} not found.`);
        }
        if (registry[componentName].registryDependencies) {
            for (const dependency of registry[componentName].registryDependencies) {
                resolveDependencies(dependency);
            }
        }
    }
    resolveDependencies(name);
    return components;
}
function registryResolveItemsTree(names) {
    let relevantItemsRegistry = resolveRegistryItems(names);
    const payload = schema_1.registrySchema.parse(relevantItemsRegistry);
    if (!payload) {
        return null;
    }
    const componentArray = Object.values(payload);
    let docs = "";
    componentArray.forEach((item) => {
        if (item.docs) {
            docs += `${item.docs}\n`;
        }
    });
    return schema_1.registryResolvedComponentsTreeSchema.parse({
        dependencies: deepmerge_1.default.all(componentArray.map((item) => { var _a; return (_a = item.dependencies) !== null && _a !== void 0 ? _a : []; })),
        devDependencies: deepmerge_1.default.all(componentArray.map((item) => { var _a; return (_a = item.devDependencies) !== null && _a !== void 0 ? _a : []; })),
        files: componentArray.map((item) => {
            return {
                src: item.src,
                target: item.target
            };
        }),
        docs,
    });
}
