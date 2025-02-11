"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = MemoriesPage;
const memories_gallery_1 = require("@/components/memories-gallery");
function MemoriesPage() {
    return (<div className="py-8 w-full">
      <div className="space-y-4 text-center mb-8">
        <h1 className="text-4xl font-bold">memories</h1>
        <p className="text-muted-foreground">relive your digital moments</p>
      </div>
      <memories_gallery_1.MemoriesGallery />
    </div>);
}
