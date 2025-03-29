import React from "react";
import { pipe } from "@screenpipe/browser";

const MoveMouseClick = () => {
  const handleMoveAndClick = async () => {
    try {
      // Move mouse to coordinates (500, 500)
      await pipe.operator.pixel.moveMouse(500, 400);
      console.log("Mouse moved to (500, 400)");

      // Click the left mouse button
      await pipe.operator.pixel.click("left");
      console.log("Mouse clicked");
    } catch (error) {
      console.error("Error in moving mouse and clicking:", error);
    }
  };

  return (
    <div>
      <button onClick={handleMoveAndClick}>Move Mouse and Click</button>
    </div>
  );
};

export default MoveMouseClick;
