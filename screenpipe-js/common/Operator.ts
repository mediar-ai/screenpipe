import type {
  ElementInfo,
  ElementSelector,
  ElementPosition,
  ElementSize,
  ElementStats,
} from "./types";
import { convertObjectToCamelCase, convertObjectToSnakeCase } from "./utils";

export interface ClickResult {
  method: "AXPress" | "AXClick" | "MouseSimulation"; // TODO: get rid of that hardcoded macos thing ...
  coordinates?: [number, number];
  details: string;
}

export interface TextRequest {
  appName: string;
  windowName?: string;
  maxDepth?: number;
  useBackgroundApps?: boolean;
  activateApp?: boolean;
}

export interface GetTextMetadata {
  extractionTimeMs: number;
  elementCount: number;
  appName: string;
  timestampUtc: string;
}

export interface TextResponse {
  success: boolean;
  text: string;
  metadata?: GetTextMetadata;
}

export interface InteractableElementsRequest {
  appName: string;
  windowName?: string;
  withTextOnly?: boolean;
  interactableOnly?: boolean;
  includeSometimesInteractable?: boolean;
  maxElements?: number;
  useBackgroundApps?: boolean;
  activateApp?: boolean;
}

export interface InteractableElement {
  index: number;
  role: string;
  interactability: string; // "definite", "sometimes", "none"
  text: string;
  position?: ElementPosition;
  size?: ElementSize;
  elementId?: string;
}

export interface InteractableElementsResponse {
  elements: InteractableElement[];
  stats: ElementStats;
}

export class Operator {
  private baseUrl: string;

  constructor(baseUrl: string = "http://localhost:3030") {
    this.baseUrl = baseUrl;
  }

  /**
   * Find UI elements on screen matching the given criteria
   *
   * @example
   * // Find all buttons in Chrome
   * const buttons = await pipe.operator.locator({
   *   app: "Chrome",
   *   role: "button"
   * }).all();
   *
   * @example
   * // Find a specific text field by label
   * const emailField = await pipe.operator.locator({
   *   app: "Firefox",
   *   label: "Email"
   * }).first();
   */
  locator(options: {
    app: string;
    window?: string;
    role?: string;
    text?: string;
    label?: string;
    description?: string;
    id?: string;
    index?: number;
    useBackgroundApps?: boolean;
    activateApp?: boolean;
  }) {
    const selector: ElementSelector = {
      app_name: options.app,
      window_name: options.window,
      locator: options.role || "",
      index: options.index,
      text: options.text,
      label: options.label,
      description: options.description,
      element_id: options.id,
      use_background_apps: options.useBackgroundApps,
      activate_app: options.activateApp,
    };

    return new ElementLocator(this.baseUrl, selector);
  }

  /**
   * Find and click an element on screen
   *
   * @returns Detailed information about the click operation
   *
   * @example
   * // Click a button with text "Submit" and get details about how it was clicked
   * const result = await pipe.operator.click({
   *   app: "Chrome",
   *   text: "Submit"
   * });
   * console.log(`Click method: ${result.method}, Details: ${result.details}`);
   */
  async click(options: {
    app: string;
    window?: string;
    role?: string;
    text?: string;
    label?: string;
    description?: string;
    id?: string;
    index?: number;
    useBackgroundApps?: boolean;
    activateApp?: boolean;
  }): Promise<ClickResult> {
    const selector: ElementSelector = {
      app_name: options.app,
      window_name: options.window,
      locator: options.role || "",
      index: options.index,
      text: options.text,
      label: options.label,
      description: options.description,
      element_id: options.id,
      use_background_apps: options.useBackgroundApps,
      activate_app: options.activateApp !== false,
    };

    const response = await fetch(
      `${this.baseUrl}/experimental/operator/click`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selector }),
      }
    );

    if (!response.ok) {
      const responseText = await response.text();
      console.log("error response:", responseText);

      try {
        const errorData = JSON.parse(responseText);
        throw new Error(
          `failed to click element: ${errorData.error || response.statusText}`
        );
      } catch (parseError) {
        throw new Error(
          `failed to click element (status ${response.status}): ${
            responseText || response.statusText
          }`
        );
      }
    }

    const data = await response.json();
    console.log("debug: click response data:", JSON.stringify(data, null, 2));

    if (!data.success) {
      throw new Error(
        `click operation failed: ${data.error || "unknown error"}`
      );
    }

    // Handle different possible response structures
    if (data.result) {
      // If data.result contains the expected structure
      return convertObjectToCamelCase(data.result) as ClickResult;
    } else if (data.method) {
      // If the ClickResult fields are directly on the data object
      return {
        method: data.method,
        coordinates: data.coordinates,
        details: data.details || "Click operation succeeded",
      } as ClickResult;
    } else {
      // Fallback with minimal information
      console.log(
        "warning: click response missing expected structure, creating fallback object"
      );
      return {
        method: "MouseSimulation",
        coordinates: undefined,
        details:
          "Click operation succeeded but returned unexpected data structure",
      };
    }
  }

  /**
   * Find an element and type text into it
   *
   * @example
   * // Type "hello@example.com" into the email field
   * await pipe.operator.fill({
   *   app: "Firefox",
   *   label: "Email",
   *   text: "hello@example.com"
   * });
   */
  async fill(options: {
    app: string;
    window?: string;
    role?: string;
    text?: string;
    label?: string;
    description?: string;
    id?: string;
    index?: number;
    useBackgroundApps?: boolean;
    activateApp?: boolean;
    value: string;
  }) {
    const selector: ElementSelector = {
      app_name: options.app,
      window_name: options.window,
      locator: options.role || "",
      index: options.index,
      text: options.text,
      label: options.label,
      description: options.description,
      element_id: options.id,
      use_background_apps: options.useBackgroundApps,
      activate_app: options.activateApp !== false,
    };

    console.log("selector", selector);

    const response = await fetch(`${this.baseUrl}/experimental/operator/type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selector,
        text: options.value,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.log("error response:", responseText);

      try {
        const errorData = JSON.parse(responseText);
        throw new Error(
          `failed to type text: ${errorData.error || response.statusText}`
        );
      } catch (parseError) {
        throw new Error(
          `failed to type text (status ${response.status}): ${
            responseText || response.statusText
          }`
        );
      }
    }

    const result = await response.json();
    return result.success;
  }

  /**
   * Get locator for an element in a specific app (by app name)
   *
   * @example
   * // Get and click a button in Chrome
   * await pipe.operator.getByAppName('Chrome').getByRole('button').click();
   */
  getByAppName(appName: string): ElementLocator {
    return this.locator({ app: appName });
  }

  /**
   * Get locator for an element in a specific window
   *
   * @example
   * // Get elements in Chrome's settings window
   * await pipe.operator.getByWindowName('Settings').getByText('Privacy').click();
   */
  getByWindowName(
    windowName: string,
    options?: { app?: string }
  ): ElementLocator {
    return this.locator({ app: options?.app || "", window: windowName });
  }

  /**
   * Get locator for elements with the specified role
   *
   * @example
   * // Find all buttons in Chrome
   * const buttons = await pipe.operator.getByRole('button', { app: 'Chrome' });
   */
  getByRole(
    role: string,
    options?: { app?: string; window?: string }
  ): ElementLocator {
    return this.locator({
      app: options?.app || "",
      window: options?.window,
      role,
    });
  }

  /**
   * Get locator for elements with the specified text
   *
   * @example
   * // Find and click on text in Chrome
   * await pipe.operator.getByText('Submit', { app: 'Chrome' }).click();
   */
  getByText(
    text: string,
    options?: { app?: string; window?: string }
  ): ElementLocator {
    return this.locator({
      app: options?.app || "",
      window: options?.window,
      text,
    });
  }

  /**
   * Get locator for elements with the specified label
   *
   * @example
   * // Find and fill a field with a specific label in Chrome
   * await pipe.operator.getByLabel('Username', { app: 'Chrome' }).fill('john');
   */
  getByLabel(
    label: string,
    options?: { app?: string; window?: string }
  ): ElementLocator {
    return this.locator({
      app: options?.app || "",
      window: options?.window,
      label,
    });
  }

  /**
   * Get locator for elements with the specified description
   *
   * @example
   * // Find and click an element with a specific description
   * await pipe.operator.getByDescription('Settings button', { app: 'Chrome' }).click();
   */
  getByDescription(
    description: string,
    options?: { app?: string; window?: string }
  ): ElementLocator {
    return this.locator({
      app: options?.app || "",
      window: options?.window,
      description,
    });
  }

  /**
   * Get locator for elements with the specified id
   *
   * @example
   * // Find and click an element with a specific ID
   * await pipe.operator.getById('submit-button', { app: 'Chrome' }).click();
   */
  getById(
    id: string,
    options?: { app?: string; window?: string }
  ): ElementLocator {
    return this.locator({
      app: options?.app || "",
      window: options?.window,
      id,
    });
  }

  /**
   * Take a screenshot of the specified app window
   *
   * @example
   * // Take a screenshot of the active Chrome window
   * const screenshot = await pipe.operator.screenshot({
   *   app: "Chrome"
   * });
   */
  async screenshot(options: {
    app: string;
    window?: string;
    activateApp?: boolean;
  }): Promise<string> {
    // TODO: Implement when screenshot API is available
    throw new Error("screenshot API not yet implemented");
  }

  /**
   * Wait for a specific element to appear
   *
   * @example
   * // Wait for a success message to appear
   * await pipe.operator.waitFor({
   *   app: "Chrome",
   *   text: "Success!",
   *   timeout: 5000
   * });
   */
  async waitFor(options: {
    app: string;
    window?: string;
    role?: string;
    text?: string;
    label?: string;
    description?: string;
    id?: string;
    index?: number;
    useBackgroundApps?: boolean;
    timeout?: number;
  }): Promise<ElementInfo | null> {
    const startTime = Date.now();
    const timeout = options.timeout || 30000;

    while (Date.now() - startTime < timeout) {
      try {
        const element = await this.locator(options).first();
        if (element) {
          return element;
        }
      } catch (error) {
        // Element not found, try again
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return null;
  }

  /**
   * get text on the screen
   *
   * @returns Detailed information about get_text operation
   *
   * @example
   * // Gets all the text from an app
   * await browserPipe.operator
   *   .getText({
   *     app: app,
   *   });
   */
  async getText(options: {
    app: string;
    window?: string;
    maxDepth?: number;
    useBackgroundApps?: boolean;
    activateApp?: boolean;
  }): Promise<TextResponse> {
    const text: TextRequest = {
      appName: options.app,
      windowName: options.window,
      maxDepth: options.maxDepth,
      useBackgroundApps: options.useBackgroundApps,
      activateApp: options.activateApp !== false,
    };

    const response = await fetch(
      `${this.baseUrl}/experimental/operator/get_text`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(convertObjectToSnakeCase(text)),
      }
    );

    if (!response.ok) {
      const responseText = await response.text();
      console.log("error response:", responseText);

      try {
        const errorData = JSON.parse(responseText);
        throw new Error(
          `failed to get text: ${errorData.error || response.statusText}`
        );
      } catch (parseError) {
        throw new Error(
          `failed to get text (status ${response.status}): ${
            responseText || response.statusText
          }`
        );
      }
    }

    const data = await response.json();
    console.log("debug: text response data:", JSON.stringify(data, null, 2));

    if (!data.success) {
      throw new Error(
        `get_text operation failed: ${data.error || "unknown error"}`
      );
    }

    return convertObjectToCamelCase(data) as TextResponse;
  }

  /**
   * get text on the screen
   *
   * @returns Detailed information about get_text operation
   *
   * @example
   * // Gets all the text from an app
   * await browserPipe.operator
   *   .getInteractableElements({
   *     app: app,
   *   });
   */
  async getInteractableElements(options: {
    app: string;
    window?: string;
    withTextOnly?: boolean;
    interactableOnly?: boolean;
    includeSometimesInteractable?: boolean;
    maxElements?: number;
    useBackgroundApps?: boolean;
    activateApp?: boolean;
  }): Promise<InteractableElementsResponse> {
    const request: InteractableElementsRequest = {
      appName: options.app,
      windowName: options.window,
      withTextOnly: options.withTextOnly,
      interactableOnly: options.interactableOnly,
      includeSometimesInteractable: options.includeSometimesInteractable,
      maxElements: options.maxElements,
      useBackgroundApps: options.useBackgroundApps,
      activateApp: options.activateApp,
    };

    const response = await fetch(
      `${this.baseUrl}/experimental/operator/list-interactable-elements`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(convertObjectToSnakeCase(request)),
      }
    );

    if (!response.ok) {
      const responseText = await response.text();
      console.log("error response:", responseText);

      try {
        const errorData = JSON.parse(responseText);
        throw new Error(
          `failed to get interactable elements: ${
            errorData.error || response.statusText
          }`
        );
      } catch (parseError) {
        throw new Error(
          `failed to get interactable elements (status ${response.status}): ${
            responseText || response.statusText
          }`
        );
      }
    }

    const data = await response.json();
    console.log("debug: text response data:", JSON.stringify(data, null, 2));

    return convertObjectToCamelCase(data) as InteractableElementsResponse;
  }

  /**
   * Click an element by its index from the cached element list
   *
   * @example
   * // Click the element at index 5
   * await pipe.operator.clickByIndex(5);
   */
  async clickByIndex(index: number): Promise<boolean> {
    const response = await fetch(
      `${this.baseUrl}/experimental/operator/click-by-index`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ element_index: index }),
      }
    );

    if (!response.ok) {
      const responseText = await response.text();
      console.log("error response:", responseText); // Add logging for debugging

      try {
        const errorData = JSON.parse(responseText);
        throw new Error(
          `failed to click element by index: ${
            errorData.error || response.statusText
          }`
        );
      } catch (parseError) {
        throw new Error(
          `failed to click element by index (status ${response.status}): ${
            responseText || response.statusText
          }`
        );
      }
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(
        `click operation failed: ${data.message || "unknown error"}`
      );
    }

    return data.success;
  }

  /**
   * Type text into an element by its index from the cached element list
   *
   * @example
   * // Type "hello world" into the element at index 3
   * await pipe.operator.typeByIndex(3, "hello world");
   */
  async typeByIndex(index: number, text: string): Promise<boolean> {
    const response = await fetch(
      `${this.baseUrl}/experimental/operator/type-by-index`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ element_index: index, text }),
      }
    );

    if (!response.ok) {
      const responseText = await response.text();
      console.log("error response:", responseText); // Add logging for debugging

      try {
        const errorData = JSON.parse(responseText);
        throw new Error(
          `failed to type text into element by index: ${
            errorData.error || response.statusText
          }`
        );
      } catch (parseError) {
        throw new Error(
          `failed to type text into element by index (status ${
            response.status
          }): ${responseText || response.statusText}`
        );
      }
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(
        `type operation failed: ${data.message || "unknown error"}`
      );
    }

    return data.success;
  }

  /**
   * Find an element and press a key combination on it
   *
   * @example
   * // Press Tab key on a text field
   * await pipe.operator.pressKey({
   *   app: "Chrome",
   *   label: "Email",
   *   key: "tab"
   * });
   *
   * @example
   * // Press keyboard shortcut Command+C on a text field
   * await pipe.operator.pressKey({
   *   app: "Safari",
   *   role: "textfield",
   *   key: "cmd+c"
   * });
   */
  async pressKey(options: {
    app: string;
    window?: string;
    role?: string;
    text?: string;
    label?: string;
    description?: string;
    id?: string;
    index?: number;
    useBackgroundApps?: boolean;
    activateApp?: boolean;
    key: string;
  }) {
    const selector: ElementSelector = {
      app_name: options.app,
      window_name: options.window,
      locator: options.role || "",
      index: options.index,
      text: options.text,
      label: options.label,
      description: options.description,
      element_id: options.id,
      use_background_apps: options.useBackgroundApps,
      activate_app: options.activateApp !== false,
    };

    const response = await fetch(
      `${this.baseUrl}/experimental/operator/press-key`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          convertObjectToSnakeCase({
            selector,
            keyCombo: options.key,
          })
        ),
      }
    );

    if (!response.ok) {
      const responseText = await response.text();
      console.log("error response:", responseText);

      try {
        const errorData = JSON.parse(responseText);
        throw new Error(
          `failed to press key: ${errorData.error || response.statusText}`
        );
      } catch (parseError) {
        throw new Error(
          `failed to press key (status ${response.status}): ${
            responseText || response.statusText
          }`
        );
      }
    }

    const result = await response.json();
    return result.success;
  }

  /**
   * Press a key combination on an element by its index from the cached element list
   *
   * @example
   * // Press Tab key on the element at index 5
   * await pipe.operator.pressKeyByIndex(5, "tab");
   *
   * @example
   * // Press Command+A (Select All) on the element at index 2
   * await pipe.operator.pressKeyByIndex(2, "cmd+a");
   */
  async pressKeyByIndex(index: number, keyCombo: string): Promise<boolean> {
    const response = await fetch(
      `${this.baseUrl}/experimental/operator/press-key-by-index`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ element_index: index, key_combo: keyCombo }),
      }
    );

    if (!response.ok) {
      const responseText = await response.text();
      console.log("error response:", responseText);

      try {
        const errorData = JSON.parse(responseText);
        throw new Error(
          `failed to press key on element by index: ${
            errorData.error || response.statusText
          }`
        );
      } catch (parseError) {
        throw new Error(
          `failed to press key on element by index (status ${
            response.status
          }): ${responseText || response.statusText}`
        );
      }
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(
        `press key operation failed: ${data.message || "unknown error"}`
      );
    }

    return data.success;
  }

  /**
   * Open an application by name
   *
   * @example
   * // Open Chrome browser
   * await pipe.operator.openApplication("Chrome");
   */
  async openApplication(applicationName: string): Promise<boolean> {
    const response = await fetch(
      `${this.baseUrl}/experimental/operator/open-application`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_name: applicationName }),
      }
    );

    if (!response.ok) {
      const responseText = await response.text();
      console.log("error response:", responseText);

      try {
        const errorData = JSON.parse(responseText);
        throw new Error(
          `failed to open application: ${
            errorData.error || response.statusText
          }`
        );
      } catch (parseError) {
        throw new Error(
          `failed to open application (status ${response.status}): ${
            responseText || response.statusText
          }`
        );
      }
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(
        `open application operation failed: ${data.message || "unknown error"}`
      );
    }

    return data.success;
  }

  /**
   * Open a URL in the specified browser or default browser
   *
   * @example
   * // Open URL in default browser
   * await pipe.operator.openUrl("https://example.com");
   *
   * @example
   * // Open URL in specified browser
   * await pipe.operator.openUrl("https://example.com", "Chrome");
   */
  async openUrl(url: string, browser?: string): Promise<boolean> {
    const response = await fetch(
      `${this.baseUrl}/experimental/operator/open-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          browser,
        }),
      }
    );

    if (!response.ok) {
      const responseText = await response.text();
      console.log("error response:", responseText);

      try {
        const errorData = JSON.parse(responseText);
        throw new Error(
          `failed to open url: ${errorData.error || response.statusText}`
        );
      } catch (parseError) {
        throw new Error(
          `failed to open url (status ${response.status}): ${
            responseText || response.statusText
          }`
        );
      }
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(
        `open url operation failed: ${data.message || "unknown error"}`
      );
    }

    return data.success;
  }
}

class ElementLocator {
  private baseUrl: string;
  private selector: ElementSelector;

  constructor(baseUrl: string, selector: ElementSelector) {
    this.baseUrl = baseUrl;
    this.selector = selector;
  }

  /**
   * Get the first element matching the selector
   */
  async first(maxDepth?: number): Promise<ElementInfo | null> {
    const elements = await this.all(1, maxDepth);
    return elements.length > 0 ? elements[0] : null;
  }

  /**
   * Get all elements matching the selector
   */
  async all(maxResults?: number, maxDepth?: number): Promise<ElementInfo[]> {
    const response = await fetch(`${this.baseUrl}/experimental/operator`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selector: this.selector,
        max_results: maxResults,
        max_depth: maxDepth,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.log("error response:", responseText);

      try {
        const errorData = JSON.parse(responseText);
        throw new Error(
          `failed to find elements: ${errorData.error || response.statusText}`
        );
      } catch (parseError) {
        throw new Error(
          `failed to find elements (status ${response.status}): ${
            responseText || response.statusText
          }`
        );
      }
    }

    const result = await response.json();
    // console.log(result);
    return result.data;
  }

  /**
   * Click the first element matching the selector
   *
   * @returns Detailed information about the click operation
   */
  async click(): Promise<ClickResult> {
    const response = await fetch(
      `${this.baseUrl}/experimental/operator/click`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selector: {
            ...this.selector,
            activate_app: this.selector.activate_app !== false,
          },
        }),
      }
    );

    if (!response.ok) {
      const responseText = await response.text();
      console.log("error response:", responseText);

      try {
        const errorData = JSON.parse(responseText);
        throw new Error(
          `failed to click element: ${errorData.error || response.statusText}`
        );
      } catch (parseError) {
        throw new Error(
          `failed to click element (status ${response.status}): ${
            responseText || response.statusText
          }`
        );
      }
    }

    const data = await response.json();
    console.log("debug: click response data:", JSON.stringify(data, null, 2));

    if (!data.success) {
      throw new Error(
        `click operation failed: ${data.error || "unknown error"}`
      );
    }

    // Handle different possible response structures
    if (data.result) {
      // If data.result contains the expected structure
      return data.result as ClickResult;
    } else if (data.method) {
      // If the ClickResult fields are directly on the data object
      return {
        method: data.method,
        coordinates: data.coordinates,
        details: data.details || "Click operation succeeded",
      } as ClickResult;
    } else {
      // Fallback with minimal information
      console.log(
        "warning: click response missing expected structure, creating fallback object"
      );
      return {
        method: "MouseSimulation",
        coordinates: undefined,
        details:
          "Click operation succeeded but returned unexpected data structure",
      };
    }
  }

  /**
   * Fill the first element matching the selector with text
   */
  async fill(text: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/experimental/operator/type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selector: {
          ...this.selector,
          activate_app: this.selector.activate_app !== false,
        },
        text,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.log("error response:", responseText);

      try {
        const errorData = JSON.parse(responseText);
        throw new Error(
          `failed to type text: ${errorData.error || response.statusText}`
        );
      } catch (parseError) {
        throw new Error(
          `failed to type text (status ${response.status}): ${
            responseText || response.statusText
          }`
        );
      }
    }

    const result = await response.json();
    return result.success;
  }

  /**
   * Check if an element matching the selector exists
   */
  async exists(): Promise<boolean> {
    try {
      const element = await this.first();
      return !!element;
    } catch (error) {
      return false;
    }
  }

  /**
   * Wait for an element matching the selector to appear
   */
  async waitFor(
    options: { timeout?: number } = {}
  ): Promise<ElementInfo | null> {
    const startTime = Date.now();
    const timeout = options.timeout || 30000;

    while (Date.now() - startTime < timeout) {
      try {
        const element = await this.first();
        if (element) {
          return element;
        }
      } catch (error) {
        // Element not found, try again
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return null;
  }

  /**
   * Press a key combination on the first element matching the selector
   *
   * @param keyCombo The key or key combination to press (e.g., "tab", "cmd+c", "shift+enter")
   * @returns Whether the operation was successful
   */
  async pressKey(keyCombo: string): Promise<boolean> {
    const response = await fetch(
      `${this.baseUrl}/experimental/operator/press-key`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selector: {
            ...this.selector,
            activate_app: this.selector.activate_app !== false,
          },
          key_combo: keyCombo,
        }),
      }
    );

    if (!response.ok) {
      const responseText = await response.text();
      console.log("error response:", responseText);

      try {
        const errorData = JSON.parse(responseText);
        throw new Error(
          `failed to press key: ${errorData.error || response.statusText}`
        );
      } catch (parseError) {
        throw new Error(
          `failed to press key (status ${response.status}): ${
            responseText || response.statusText
          }`
        );
      }
    }

    const result = await response.json();
    return result.success;
  }
}
