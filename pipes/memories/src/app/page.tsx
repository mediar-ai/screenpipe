import { MemoriesGallery } from "@/components/memories-gallery";

export default function MemoriesPage() {
  return (
    <div className="py-8 w-full">
      <div className="space-y-4 text-center mb-8">
        <h1 className="text-4xl font-bold">memories</h1>
        <p className="text-muted-foreground">relive your digital moments</p>
      </div>
      <MemoriesGallery />
    </div>
  );
}
