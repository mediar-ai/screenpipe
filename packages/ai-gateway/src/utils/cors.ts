// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
/**
 * Adds CORS headers to a response
 * @param response The response to add headers to
 * @returns The response with CORS headers added
 */
export function addCorsHeaders(response: Response): Response {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', '*');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  const exposed = new Set((response.headers.get('Access-Control-Expose-Headers') ?? '').split(',').map(value => value.trim()).filter(Boolean));
  for (const name of ['x-screenpipe-model', 'x-screenpipe-gateway', 'x-screenpipe-gateway-reason']) exposed.add(name);
  response.headers.set('Access-Control-Expose-Headers', [...exposed].join(', '));
  response.headers.set('Access-Control-Max-Age', '86400');
  response.headers.append('Vary', 'Origin');
  return response;
}

/**
 * Handles OPTIONS requests for CORS preflight
 * @param request The request object
 * @returns A response for the OPTIONS request
 */
export function handleOptions(request: Request): Response {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400',
  };

  if (
    request.headers.get('Origin') !== null &&
    request.headers.get('Access-Control-Request-Method') !== null &&
    request.headers.get('Access-Control-Request-Headers') !== null
  ) {
    return new Response(null, {
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || '*',
      },
    });
  }

  return new Response(null, {
    headers: {
      Allow: 'GET, HEAD, POST, OPTIONS',
    },
  });
}

/**
 * Creates a standardized success response with CORS headers
 * @param body The response body (string or object)
 * @param status The HTTP status code (default: 200)
 * @returns A Response object with CORS headers
 */
export function createSuccessResponse(body: string | object, status = 200): Response {
  const responseBody = typeof body === 'string' ? body : JSON.stringify(body);
  const contentType = typeof body === 'string' ? 'text/plain' : 'application/json';
  
  const response = new Response(responseBody, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
      'Content-Type': contentType,
    },
  });
  response.headers.append('Vary', 'Origin');
  return response;
}

/**
 * Creates a standardized error response with CORS headers
 * @param status The HTTP status code
 * @param message The error message
 * @returns A Response object with CORS headers
 */
export function createErrorResponse(status: number, message: string): Response {
  const response = new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
        'Content-Type': 'application/json',
      },
    }
  );
  response.headers.append('Vary', 'Origin');
  return response;
}