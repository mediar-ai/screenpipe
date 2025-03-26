import { load } from 'cheerio';

/**
 * Parses any HTML content and returns a clean, readable text format
 * @param htmlContent The raw HTML content to parse
 * @returns Formatted content as a string
 */
export function parseHtmlContent(htmlContent: string): string {
  try {
    // Load HTML content into cheerio for parsing
    const $ = load(htmlContent);
    
    // Remove script and style elements
    $('script, style, link, meta').remove();
    
    // Initialize the formatted output
    let formattedContent = '';
    
    // Process headings
    $('h1, h2, h3, h4, h5, h6').each((_, element) => {
      const level = element.name.charAt(1);
      const headingText = $(element).text().trim();
      
      // Add appropriate markdown heading based on level
      formattedContent += `${'#'.repeat(parseInt(level))} ${headingText}\n\n`;
    });
    
    // Process paragraphs
    $('p').each((_, element) => {
      const paragraphText = $(element).text().trim();
      if (paragraphText) {
        formattedContent += `${paragraphText}\n\n`;
      }
    });
    
    // Process lists
    $('ul, ol').each((_, listElement) => {
      $(listElement).find('li').each((index, item) => {
        const listItemText = $(item).text().trim();
        formattedContent += `- ${listItemText}\n`;
      });
      formattedContent += '\n';
    });
    
    // Process code blocks
    $('pre, code').each((_, element) => {
      const codeText = $(element).text().trim();
      if (codeText) {
        formattedContent += '```\n' + codeText + '\n```\n\n';
      }
    });
    
    // Process tables
    $('table').each((_, table) => {
      let tableContent = '';
      
      // Process table headers
      $(table).find('th').each((_, header) => {
        tableContent += `| ${$(header).text().trim()} `;
      });
      tableContent += '|\n';
      
      // Add separator row
      $(table).find('th').each(() => {
        tableContent += '| --- ';
      });
      tableContent += '|\n';
      
      // Process table rows
      $(table).find('tr').each((_, row) => {
        if ($(row).find('th').length === 0) { // Skip header row
          $(row).find('td').each((_, cell) => {
            tableContent += `| ${$(cell).text().trim()} `;
          });
          tableContent += '|\n';
        }
      });
      
      formattedContent += tableContent + '\n';
    });
    
    // Process links
    $('a').each((_, link) => {
      const linkText = $(link).text().trim();
      const href = $(link).attr('href');
      if (linkText && href) {
        formattedContent += `[${linkText}](${href})\n`;
      }
    });
    
    // Clean up the formatted content
    formattedContent = formattedContent
      .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newlines
      .trim();
    
    console.log("successfully parsed html content");
    return formattedContent;
  } catch (error) {
    console.error("error parsing html content:", error);
    return "Error parsing HTML content. Please check the original source.";
  }
}

/**
 * Extracts just the main text content from HTML, removing all formatting
 * @param htmlContent The raw HTML content
 * @returns Plain text content
 */
export function extractPlainText(htmlContent: string): string {
  try {
    const $ = load(htmlContent);
    
    // Remove script, style, and other non-content elements
    $('script, style, link, meta, svg, path').remove();
    
    // Get the text content
    const text = $('body').text()
      .replace(/\s+/g, ' ')  // Replace multiple spaces with a single space
      .trim();
    
    console.log("successfully extracted plain text from html");
    return text;
  } catch (error) {
    console.error("error extracting plain text from html:", error);
    return "Error extracting text. Please check the original source.";
  }
}

/**
 * Parses HTML API documentation and returns a clean, structured format
 * @param htmlContent The raw HTML content from the API documentation page
 * @returns Formatted API documentation as a string
 */
export function parseApiDocs(htmlContent: string): string {
  try {
    // Load HTML content into cheerio for parsing
    const $ = load(htmlContent);
    
    // Initialize the formatted output
    let formattedDocs = "# Screenpipe API Reference\n\n";
    
    // Extract main API sections (h3 elements)
    $('h3').each((_, element) => {
      const sectionTitle = $(element).text().trim();
      const sectionId = $(element).attr('id');
      
      formattedDocs += `## ${sectionTitle}\n`;
      
      // Find all h4 elements (endpoints) until the next h3
      let nextSection = $(element).nextUntil('h3');
      
      // Extract endpoints (h4 elements)
      nextSection.filter('h4').each((_, endpointElement) => {
        const endpointTitle = $(endpointElement).text().trim();
        formattedDocs += `\n### ${endpointTitle}\n`;
        
        // Extract endpoint details
        const details = $(endpointElement).nextUntil('h4, h3');
        
        // Extract endpoint information (method, url, description)
        details.filter('ul').first().find('li').each((_, li) => {
          const text = $(li).text().trim();
          if (text.includes('endpoint') || text.includes('method') || text.includes('description')) {
            formattedDocs += `- ${text}\n`;
          }
        });
        
        // Add sample request/response if available
        const sampleHeadings = details.filter('h5');
        sampleHeadings.each((_, sampleHeading) => {
          const headingText = $(sampleHeading).text().trim();
          formattedDocs += `\n#### ${headingText}\n`;
          
          // Find the code block that follows this heading
          const codeBlock = $(sampleHeading).nextUntil('h5, h4, h3').filter('div.nextra-code-block');
          if (codeBlock.length) {
            const code = codeBlock.find('code').text().trim();
            formattedDocs += "```json\n" + code + "\n```\n";
          }
        });
      });
      
      formattedDocs += "\n";
    });
    
    console.log("successfully parsed api documentation");
    return formattedDocs;
    
  } catch (error) {
    console.error("error parsing api documentation:", error);
    return "Error parsing API documentation. Please check the original source.";
  }
}

/**
 * Extracts just the essential endpoints and methods from API documentation
 * @param htmlContent The raw HTML content from the API documentation page
 * @returns A simplified list of available endpoints
 */
export function extractEndpoints(htmlContent: string): string {
  try {
    const $ = load(htmlContent);
    let endpoints = "# Available Screenpipe API Endpoints\n\n";
    
    $('h3').each((_, section) => {
      const sectionName = $(section).text().trim();
      endpoints += `## ${sectionName}\n`;
      
      $(section).nextUntil('h3').filter('h4').each((_, endpoint) => {
        const endpointName = $(endpoint).text().trim();
        
        // Find the endpoint URL and method
        const details = $(endpoint).nextUntil('h4, h3').filter('ul').first();
        let url = "";
        let method = "";
        
        details.find('li').each((_, li) => {
          const text = $(li).text().trim();
          if (text.includes('endpoint')) {
            url = text.split('endpoint')[1].trim().replace(/^:/, '').trim();
          } else if (text.includes('method')) {
            method = text.split('method')[1].trim().replace(/^:/, '').trim();
          }
        });
        
        if (url && method) {
          endpoints += `- \`${method.toUpperCase()}\` ${url} - ${endpointName}\n`;
        }
      });
      
      endpoints += "\n";
    });
    
    console.log("successfully extracted api endpoints");
    return endpoints;
    
  } catch (error) {
    console.error("error extracting api endpoints:", error);
    return "Error extracting API endpoints. Please check the original source.";
  }
} 