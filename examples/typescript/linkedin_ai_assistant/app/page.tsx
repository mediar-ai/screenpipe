import Image from "next/image";
import { LaunchLinkedInChromeSession } from "@/components/launch_linkedin_chrome_session";
import TemplateEditor from "@/components/TemplateEditor";
import template from "@/lib/storage/templates.json";

export default function Home() {
  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen w-full p-4 pb-20 gap-16 sm:p-8">
      <main className="w-full max-w-[95vw] flex flex-col gap-8 row-start-2 items-center sm:items-start justify-center">
        {/* <Image
          className="dark:invert text-center"
          src="https://screenpi.pe/1024x1024.png"
          alt="Next.js logo"
          width={180}
          height={38}
          priority
        /> */}
        <LaunchLinkedInChromeSession />
        <TemplateEditor initialTemplate={template} />
      </main>
    </div>
  );
}
