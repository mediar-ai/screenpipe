"use client";

import { useState, useEffect, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { IconShare, IconTrash } from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";
import { TwitterTweetEmbed } from "react-twitter-embed";
import TextareaAutosize from "react-textarea-autosize";
import * as store from "@/lib/store";
import { postReply } from "@/lib/actions/post-reply";
import type { Suggestion } from "@/lib/actions/run-bot";
import type { CookieParam } from "puppeteer-core";

interface Props {
  cookies: CookieParam[];
  isConnected: boolean;
  isRunning: boolean;
}

export function SuggestionList({ cookies, isConnected, isRunning }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    store.getSuggestions().then(setSuggestions);

    const eventSource = new EventSource("/api/suggestions");

    eventSource.onmessage = (event) => {
      try {
        const s: Suggestion = JSON.parse(event.data);
        setSuggestions((prev) => {
          const ids = new Set(prev.map((s) => s.tweetId));
          if (ids.has(s.tweetId)) {
            return prev;
          } else {
            return [...prev, s];
          }
        });
      } catch (e) {
        console.error("Failed to add suggestions:", e);
      }
    };

    eventSource.onerror = (e) => {
      console.error("Failed to add suggestions:", e);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const setReply = (e: ChangeEvent<HTMLTextAreaElement>, i: number) => {
    setSuggestions((prev) =>
      prev.map((s, i2) => (i2 === i ? { ...s, reply: e.target?.value } : s)),
    );
  };

  const post = async (i: number) => {
    const success = await postReply(cookies, suggestions[i]);
    if (success) await remove(i);
  };

  const remove = async (i: number) => {
    await store.deleteSuggestion(i);
    setSuggestions((prev) => prev.filter((_, i2) => i !== i2));
  };

  return (
    <ul className="flex flex-col gap-8 lg:grow lg:overflow-y-auto pb-32 lg:pb-64">
      {suggestions.map((s, i) => (
        <li key={i}>
          <div className="flex flex-col xl:flex-row gap-8">
            <div className="flex flex-col items-center w-full xl:block xl:w-1/3">
              <TwitterTweetEmbed key={s.tweetId} tweetId={s.tweetId} />
            </div>
            <div className="flex flex-col items-center gap-8 xl:w-2/3">
              <div className="rounded-lg border bg-card text-card-foreground shadow-sm w-full p-4">
                <h3 className="text-lg text-center font-bold">
                  Suggested Reply
                </h3>
                <Separator className="my-4" />
                <TextareaAutosize
                  className="w-full p-2"
                  value={s.reply}
                  onChange={(e) => setReply(e, i)}
                />
              </div>
              <div className="rounded-lg border bg-card text-card-foreground shadow-sm w-full p-4">
                <h3 className="text-lg text-center font-bold">Reason</h3>
                <Separator className="my-4" />
                <p className="p-2">{s.reason}</p>
              </div>
              <div className="flex flex-col sm:flex-row sm:justify-center gap-4">
                <Button
                  variant="outline"
                  size="lg"
                  className="text-base h-12"
                  disabled={!isConnected}
                  onClick={() => post(i)}
                >
                  <IconShare />
                  Post
                </Button>
                <Button
                  size="lg"
                  className="text-base h-12"
                  onClick={() => remove(i)}
                >
                  <IconTrash />
                  Delete
                </Button>
              </div>
            </div>
          </div>
          {i < suggestions.length - 1 && <Separator className="mt-8" />}
        </li>
      ))}
    </ul>
  );
}
