import "@testing-library/jest-dom/vitest";
import { JSDOM } from "jsdom";

if (typeof window === "undefined") {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost",
  });

  const globalWithDom = globalThis as typeof globalThis & {
    window: Window;
    document: Document;
    navigator: Navigator;
    location: Location;
    HTMLElement: typeof HTMLElement;
  };

  globalWithDom.window = dom.window as unknown as Window;
  globalWithDom.document = dom.window.document;
  globalWithDom.navigator = dom.window.navigator as Navigator;
  globalWithDom.location = dom.window.location;
  globalWithDom.HTMLElement = dom.window.HTMLElement;
}
