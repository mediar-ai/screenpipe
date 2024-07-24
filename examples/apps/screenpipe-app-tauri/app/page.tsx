"use client";

import { ChatList } from "@/components/chat-list";
import Image from "next/image";
import { Button } from "@/components/ui/button"; // Import Button from shadcn

function Header() {
  return (
    <div>
      <div className="mb-16 relative z-[-1] flex flex-col items-center">
        <div className="relative flex flex-col items-center before:absolute before:h-[300px] before:w-full before:-translate-x-1/2 before:rounded-full before:bg-gradient-radial before:from-white before:to-transparent before:blur-2xl before:content-[''] after:absolute after:-z-20 after:h-[180px] after:w-full after:translate-x-1/3 after:bg-gradient-conic after:from-sky-200 after:via-blue-200 after:blur-2xl after:content-[''] before:dark:bg-gradient-to-br before:dark:from-transparent before:dark:to-blue-700 before:dark:opacity-10 after:dark:from-sky-900 after:dark:via-[#0141ff] after:dark:opacity-40 sm:before:w-[480px] sm:after:w-[240px] before:lg:h-[360px] gap-4">
          <Image
            className="relative dark:drop-shadow-[0_0_0.3rem_#ffffff70] dark:invert"
            src="/screenpipe.svg"
            alt="Screenpipe Logo"
            width={180}
            height={37}
            priority
          />
          <p className="absolute left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
            Personalized AI powered by what you have seen, said, or heard.
          </p>
        </div>
      </div>
      <div className="mt-4 flex space-x-4 absolute top-4 right-4">
        {" "}
        {/* Added margin-top for spacing */}
        <Button
          asChild
          className="cursor-pointer"
          onClick={() =>
            window.open(
              "https://github.com/louis030195/screen-pipe/tree/main/examples/ts",
              "_blank"
            )
          }
        >
          <h2 className="mb-3 text-2xl font-semibold">Get started</h2>
        </Button>
        <Button
          asChild
          className="cursor-pointer"
          onClick={() =>
            window.open(
              "mailto:louis@screenpi.pe?subject=Screenpipe%20Feedback&body=Please%20enter%20your%20feedback%20here...%0A%0A...%20or%20let's%20chat?%0Ahttps://cal.com/louis030195/screenpipe",
              "_blank"
            )
          }
        >
          <h2 className="mb-3 text-2xl font-semibold">Send feedback</h2>
        </Button>
      </div>
    </div>
  );
}
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-8">
      <Header /> {/* Use Header component */}
      <ChatList />
    </main>
  );
}
