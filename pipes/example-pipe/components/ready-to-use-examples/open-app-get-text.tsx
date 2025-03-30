import React, { useState } from "react";
import { pipe } from "@screenpipe/browser";

const getBrowserName = () => {
  if (
    getComputedStyle(document.documentElement).getPropertyValue(
      "--arc-palette-title"
    )
  )
    return "arc";
  const userAgent = window.navigator.userAgent;

  if (userAgent.includes("Firefox")) return "firefox";
  if (userAgent.includes("Edge") || userAgent.includes("Edg")) return "edge";
  if (userAgent.includes("Chrome") && !userAgent.includes("Edg"))
    return "chrome";
  if (userAgent.includes("Safari") && !userAgent.includes("Chrome"))
    return "safari";
  if (userAgent.includes("Opera") || userAgent.includes("OPR")) return "opera";

  return "unknown";
};

const OpenAppGetText = () => {
  const [text, setText] = useState("");
  const handleOpenAppAndGetText = async () => {
    try {
      const browserName = getBrowserName();
      console.log("Browser name:", browserName);
      // Open an application, e.g., 'TextEdit' on macOS
      // await pipe.operator.openApplication("TextEdit").catch((error) => {
      //   console.warn("Error in opening application:", error);
      // });
      // console.log("Application opened");

      // Assuming we have an element ID to get text from
      const element = await pipe.operator
        .getByRole("AXWebArea", {
          app: browserName,
          activateApp: true,
          useBackgroundApps: true,
        })
        .first();

      const text = element?.text;
      setText(text || "");
      console.log("Retrieved text:", text);

      // await pipe.operator.openApplication(browserName);
    } catch (error) {
      console.error("Error in opening app and getting text:", error);
    }
  };

  return (
    <div>
      <button onClick={handleOpenAppAndGetText}>Open App and Get Text</button>
      <p>text scraped: {text}</p>
    </div>
  );
};

export default OpenAppGetText;
