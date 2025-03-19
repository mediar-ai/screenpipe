// Import required components from the SDK
import { pipe } from "../src/index";

async function listArcElements(strictMode = true) {
  console.log(`finding elements in arc browser... (strictness: ${strictMode ? "strict" : "flexible"})`);
    
  try {
    console.log("starting element search...");
    const startTime = Date.now();
    
    // Try the SDK method for comparison
    console.log("\nsdk method:");
    const sdkElements = await pipe.operator
        .locator({
        app: "Arc",
        useBackgroundApps: true, 
        activateApp: true,
        role: "",
        })
        .all(2, 0); // maxResults, maxDepth 
    
    // filter for interactable elements only
    const interactableRoles = [
      "button", 
      "textfield", 
      "checkbox", 
      "combobox", 
      "list", 
      "listitem", 
      "menu", 
      "menuitem", 
      "tab"
    ];
    
    // Create counters for each detection type
    let roleMatchCount = 0;
    let actionPropertiesCount = 0;
    let interactableTextCount = 0;
    
    // Track counts per interactive role
    const interactableRoleCounts = {};
    interactableRoles.forEach(role => {
      interactableRoleCounts[role] = 0;
    });
    
    // Get a distribution of all roles
    const allRoleCounts = {};
    
    const interactableElements = sdkElements.filter(el => {
      // Add to overall role distribution
      const originalRole = el.role || "unknown";
      allRoleCounts[originalRole] = (allRoleCounts[originalRole] || 0) + 1;
      
      // 1. Check if role is in our list - normalize by removing AX prefix and making lowercase
      const normalizedRole = (el.role || "").replace(/^AX/i, "").toLowerCase();
      const roleMatch = interactableRoles.includes(normalizedRole);
      
      // Count each specific interactable role
      if (roleMatch) {
        roleMatchCount++;
        interactableRoleCounts[normalizedRole]++;
      }
      
      // 2. Check for action properties
      const hasActions = el.properties && 
        (Object.keys(el.properties).some(p => 
          p.includes("Press") || p.includes("Click") || 
          p.includes("Action") || p.includes("Enable")
        ) || 
        Object.values(el.properties).some(v => 
          v && typeof v === "object" && 
          Object.keys(v).some(k => k.includes("Action"))
        ));
      if (hasActions) actionPropertiesCount++;
      
      // 3. Check for common interactable patterns in description or label
      const hasInteractableText = 
        (el.label && /button|link|click|select|input|field/i.test(el.label)) ||
        (el.description && /button|link|click|select|input|field/i.test(el.description));
      if (hasInteractableText) interactableTextCount++;
      
      // Return based on strictness mode
      return strictMode ? 
        roleMatch : // strict: only role-based matching
        (roleMatch || hasActions || hasInteractableText); // flexible: any criteria
    });
    
    // Log one complete element for debugging structure
    if (sdkElements.length > 0) {
      console.log("sample element structure:", JSON.stringify(sdkElements[0], null, 2));
    }
    
    // Log interactable role breakdown
    console.log("\ninteractable role breakdown:");
    Object.entries(interactableRoleCounts)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .forEach(([role, count]) => {
        console.log(`- ${role}: ${count} elements`);
      });
    
    // Log detection method counts
    console.log("\ndetection breakdown:");
    console.log(`- role match: ${roleMatchCount} elements`);
    console.log(`- action properties: ${actionPropertiesCount} elements`);
    console.log(`- interactable text: ${interactableTextCount} elements`);
    console.log(`- total unique interactable: ${interactableElements.length} elements`);
    
    const endTime = Date.now();
    console.log(`sdk found ${sdkElements.length} total elements, ${interactableElements.length} interactable in ${endTime - startTime}ms`);
    console.log(`mode: ${strictMode ? "strict (role only)" : "flexible (role, actions, or text)"}`);
    
    // log first few interactable elements
    if (interactableElements.length > 0) {
      console.log(`first interactable element: ${JSON.stringify(interactableElements[0], null, 2)}`);
      
      // Click using the element's ID (more precise)
      console.log("attempting to click the first interactable element using element id...");
      try {
        const elementId = interactableElements[0].id;
        console.log(`clicking element with id: ${elementId}`);
        const clickResult = await pipe.operator.click({
          app: "Arc",
          id: elementId,
          useBackgroundApps: true,
          activateApp: true
        });
        
        console.log("\n📌 CLICK OPERATION DETAILS 📌");
        
        // Add more defensive checks
        if (clickResult) {
          console.log("Raw click result:", JSON.stringify(clickResult, null, 2));
          
          // Check if method exists before accessing
          if (clickResult.method) {
            console.log(`Method used: ${clickResult.method}`);
          } else {
            console.log("Method: Unknown (not provided in response)");
          }
          
          // Check if coordinates exist
          if (clickResult.coordinates) {
            console.log(`Coordinates: (${clickResult.coordinates[0]}, ${clickResult.coordinates[1]})`);
          } else {
            console.log("Coordinates: Not available (accessibility API used)");
          }
          
          // Check if details exist
          if (clickResult.details) {
            console.log(`Details: ${clickResult.details}`);
          } else {
            console.log("Details: Not provided");
          }
        } else {
          console.log("Click operation returned undefined result");
        }
        
      } catch (error) {
        console.error("error clicking element:", error);
      }

      // Click by description
      console.log("attempting to click by description...");
      try {
        const description = interactableElements[0].description;
        console.log(`clicking element with description: ${description}`);
        const clickResult = await pipe.operator.click({
          app: "Arc",
          description: description,
          useBackgroundApps: true,
          activateApp: true
        });
        
        console.log("\n📌 CLICK OPERATION DETAILS 📌");
        console.log("Raw click result:", JSON.stringify(clickResult, null, 2));
        
        // Add more defensive checks
        if (clickResult) {
          // Check if method exists before accessing
          if (clickResult.method) {
            console.log(`Method used: ${clickResult.method}`);
          } else {
            console.log("Method: Unknown (not provided in response)");
          }
          
          // Check if coordinates exist
          if (clickResult.coordinates) {
            console.log(`Coordinates: (${clickResult.coordinates[0]}, ${clickResult.coordinates[1]})`);
          } else {
            console.log("Coordinates: Not available (accessibility API used)");
          }
          
          // Check if details exist
          if (clickResult.details) {
            console.log(`Details: ${clickResult.details}`);
          } else {
            console.log("Details: Not provided");
          }
        } else {
          console.log("Click operation returned undefined result");
        }
        
      } catch (error) {
        console.error("error clicking element by description:", error);
      }
    } else {
      console.log("no interactable elements found - check the element structure");
    }
    
  } catch (error) {
    console.error("error in main function:", error);
    return [];
  }
}

// Execute the function with strict mode
listArcElements(true)
  .then(() => console.log("finished listing arc elements"))
  .catch(err => console.error("error in script:", err));
