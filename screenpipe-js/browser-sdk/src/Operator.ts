import type { ElementInfo, ElementSelector } from "../../common/types";

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
      locator: options.role || "*",
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
   * @example
   * // Click a button with text "Submit"
   * await pipe.operator.click({
   *   app: "Chrome",
   *   text: "Submit"
   * });
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
  }) {
    const selector: ElementSelector = {
      app_name: options.app,
      window_name: options.window,
      locator: options.role || "*",
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
      const errorData = await response.json();
      throw new Error(
        `failed to click element: ${errorData.message || response.statusText}`
      );
    }

    const result = await response.json();
    return result.success;
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
      locator: options.role || "*",
      index: options.index,
      text: options.text,
      label: options.label,
      description: options.description,
      element_id: options.id,
      use_background_apps: options.useBackgroundApps,
      activate_app: options.activateApp !== false,
    };

    const response = await fetch(`${this.baseUrl}/experimental/operator/type`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selector,
        text: options.value,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `failed to type text: ${errorData.message || response.statusText}`
      );
    }

    const result = await response.json();
    return result.success;
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
      const errorData = await response.json();
      throw new Error(
        `failed to find elements: ${errorData.message || response.statusText}`
      );
    }

    const result = await response.json();
    console.log(result);
    return result.data;
  }

  /**
   * Click the first element matching the selector
   */
  async click(): Promise<boolean> {
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
      const errorData = await response.json();
      throw new Error(
        `failed to click element: ${errorData.message || response.statusText}`
      );
    }

    const result = await response.json();
    return result.success;
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
      const errorData = await response.json();
      throw new Error(
        `failed to type text: ${errorData.message || response.statusText}`
      );
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
}
