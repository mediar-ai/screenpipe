import { NextResponse } from "next/server";
import { pipe as browserPipe } from "../../../../../screenpipe-js/browser-sdk/dist";

export async function GET(request: Request) {
  try {
    // Get query parameters
    const url = new URL(request.url);
    const app = url.searchParams.get("app") || "Chrome";
    const windowName = url.searchParams.get("window") || undefined;
    
    // Boolean parameters - convert string to boolean
    const withTextOnly = url.searchParams.get("with_text_only") === "true";
    const interactableOnly = url.searchParams.get("interactable_only") === "true";
    const includeSometimesInteractable = url.searchParams.get("include_sometimes_interactable") === "true";
    const useBackgroundApps = url.searchParams.get("use_background_apps") === "true";
    const activateApp = url.searchParams.get("activate_app") === "true";
    const verbose = url.searchParams.get("verbose") === "true";
    
    // Numeric parameter
    const maxElements = url.searchParams.get("max_elements") 
      ? parseInt(url.searchParams.get("max_elements") || "", 10) 
      : undefined;
    
    console.log(`listing elements for app: ${app}, window: ${windowName || 'any'}`);
    console.log(`filters: text_only=${withTextOnly}, interactable=${interactableOnly}, sometimes=${includeSometimesInteractable}, verbose=${verbose}`);
    console.log(`options: max=${maxElements}, background=${useBackgroundApps}, activate=${activateApp}`);
    
    // Use the Operator SDK to locate UI elements
    const result = await browserPipe.operator.get_interactable_elements({
      app: app,
      window: windowName,
      with_text_only: withTextOnly,
      interactable_only: interactableOnly,
      include_sometimes_interactable: includeSometimesInteractable,
      max_elements: maxElements,
      use_background_apps: useBackgroundApps,
      activate_app: activateApp
    });
    
    console.log(`found ${result.elements.length} elements in ${app}`);
    
    // Format simplified elements if not in verbose mode
    let responseElements;
    if (!verbose) {
      responseElements = result.elements.map(el => {
        // Use first letter of interactability as the indicator (d for definite, s for sometimes, n for none)
        const interactabilityCode = el.interactability.charAt(0);
        return `[${el.index}] [${interactabilityCode}] '${el.text}'`;
      });
      console.log(`formatted ${responseElements.length} elements in simplified format`);
    } else {
      responseElements = result.elements;
      console.log(`returning ${responseElements.length} elements in verbose format`);
    }
    
    return NextResponse.json({
      app,
      window: windowName,
      query_params: {
        with_text_only: withTextOnly,
        interactable_only: interactableOnly,
        include_sometimes_interactable: includeSometimesInteractable,
        max_elements: maxElements,
        use_background_apps: useBackgroundApps,
        activate_app: activateApp,
        verbose: verbose
      },
      elements: responseElements,
      stats: result.stats
    });
  } catch (error) {
    console.error("error accessing ui elements:", error);
    return NextResponse.json(
      { error: `failed to access ui elements: ${error}` },
      { status: 500 }
    );
  }
}