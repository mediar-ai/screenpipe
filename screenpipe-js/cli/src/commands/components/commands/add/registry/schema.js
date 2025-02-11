"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registryResolvedComponentsTreeSchema = exports.registrySchema = exports.registryComponentSchema = void 0;
const zod_1 = require("zod");
exports.registryComponentSchema = zod_1.z.object({
    name: zod_1.z.string(),
    src: zod_1.z.string(),
    internal: zod_1.z.boolean().optional(),
    docs: zod_1.z.string().optional(),
    target: zod_1.z.string(),
    dependencies: zod_1.z.array(zod_1.z.string()).optional(),
    registryDependencies: zod_1.z.array(zod_1.z.string()).optional(),
    devDependencies: zod_1.z.array(zod_1.z.string()).optional()
});
exports.registrySchema = zod_1.z.record(zod_1.z.string(), exports.registryComponentSchema);
exports.registryResolvedComponentsTreeSchema = exports.registryComponentSchema.pick({
    dependencies: true,
    devDependencies: true,
    docs: true,
}).merge(zod_1.z.object({
    files: zod_1.z.array(zod_1.z.object({
        src: zod_1.z.string(),
        target: zod_1.z.string()
    }))
}));
