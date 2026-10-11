// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! Refuse requests that a web page, rather than a local client, sent to the
//! local API.
//!
//! Binding to loopback does not keep websites out: every page the user opens
//! can send requests to `127.0.0.1`. CORS only decides whether the page may
//! read the response; the handler has already run. Two headers close the gap:
//!
//! - `Origin`. Browsers send it on WebSocket handshakes, CORS requests, and
//!   every request other than GET and HEAD. A page cannot forge it, only
//!   degrade it to `null`, which is refused. A non-local origin is refused
//!   before any handler runs, including auth-exempt routes.
//! - `Host`. DNS rebinding points an attacker's domain at `127.0.0.1`, which
//!   makes the page same-origin with the API, so its GETs carry no `Origin`.
//!   The browser still sends the attacker's hostname as `Host`. Rebinding needs
//!   a DNS name, so IP literals and `localhost` are the only safe values.
//!
//! Cross-site no-cors GETs (images, navigations) carry no `Origin`, like the
//! webview's own image loads, so they pass; the page cannot read the response.
//! Local clients (curl, pipes, MCP, the CLI) send no `Origin` and a loopback
//! `Host`; API auth governs them.

use std::net::{IpAddr, SocketAddr};

use axum::{
    extract::{Request, State},
    http::{
        header::{CONTENT_TYPE, HOST, ORIGIN},
        uri::Authority,
        HeaderValue, StatusCode, Uri,
    },
    middleware::Next,
    response::{IntoResponse, Response},
};
use tracing::debug;

#[derive(Clone, Copy, Debug)]
pub(crate) struct OriginGuard {
    check_host: bool,
}

impl OriginGuard {
    /// LAN clients reach a non-loopback bind through names this process cannot
    /// enumerate (mDNS, Tailscale, router DNS). API auth is forced on for those
    /// binds, and the `Origin` check still refuses cross-site writes.
    pub(crate) fn for_bind_address(addr: SocketAddr) -> Self {
        Self {
            check_host: addr.ip().is_loopback(),
        }
    }
}

/// The desktop webview (`tauri://localhost`, `http://tauri.localhost`) and
/// local development servers. Shared with the CORS layer so the two cannot
/// disagree about which pages are first-party.
pub(crate) fn is_allowed_local_origin(origin: &HeaderValue) -> bool {
    let Some(uri) = parse_origin(origin) else {
        return false;
    };
    let (Some(scheme), Some(host)) = (uri.scheme_str(), uri.host()) else {
        return false;
    };
    matches!(
        (scheme, host),
        ("http", "localhost")
            | ("https", "localhost")
            | ("tauri", "localhost")
            | ("http", "tauri.localhost")
            | ("http", "127.0.0.1")
            | ("https", "127.0.0.1")
    )
}

/// The same extension schemes that browser pairing accepts. Web pages cannot
/// send these origins.
fn is_browser_extension_origin(origin: &HeaderValue) -> bool {
    parse_origin(origin).is_some_and(|uri| {
        matches!(
            uri.scheme_str(),
            Some("chrome-extension" | "moz-extension" | "extension")
        ) && uri.host().is_some()
    })
}

/// Routes the browser extension calls: the liveness probe and the bridge.
/// Everything else, including history and pipe routes, stays webview-only.
fn is_browser_extension_route(path: &str) -> bool {
    path == "/health"
        || ["/browser", "/connections/browser"].iter().any(|prefix| {
            path.strip_prefix(prefix)
                .is_some_and(|tail| tail.starts_with('/'))
        })
}

fn is_allowed_origin(path: &str, origin: &HeaderValue) -> bool {
    is_allowed_local_origin(origin)
        || (is_browser_extension_route(path) && is_browser_extension_origin(origin))
}

fn parse_origin(origin: &HeaderValue) -> Option<Uri> {
    origin.to_str().ok()?.parse().ok()
}

/// Whether a `Host` value names something DNS rebinding cannot control.
fn is_rebinding_safe_host(value: &HeaderValue) -> bool {
    let Some(authority) = value
        .to_str()
        .ok()
        .and_then(|value| value.parse::<Authority>().ok())
    else {
        return false;
    };
    // Browsers never put userinfo in `Host`; refuse it rather than guess
    // which side of the `@` a downstream parser would trust. `Authority` also
    // accepts a non-numeric port, which no client sends.
    let host = authority.host();
    let has_port = authority.as_str().len() > host.len();
    if authority.as_str().contains('@') || (has_port && authority.port_u16().is_none()) {
        return false;
    }
    let host = host
        .strip_prefix('[')
        .and_then(|host| host.strip_suffix(']'))
        .unwrap_or(host);
    host.eq_ignore_ascii_case("localhost") || host.parse::<IpAddr>().is_ok()
}

pub(crate) async fn origin_guard(
    State(guard): State<OriginGuard>,
    req: Request,
    next: Next,
) -> Response {
    let path = req.uri().path();
    let headers = req.headers();

    // Logged at debug: any page the user visits can trigger refusals. Never
    // log the header value; it names a site the user visited.
    if !headers
        .get_all(ORIGIN)
        .iter()
        .all(|origin| is_allowed_origin(path, origin))
    {
        debug!(path, "local API refused a request from a non-local Origin");
        return forbidden(
            r#"{"error":"forbidden: the local API does not accept requests from web pages"}"#,
        );
    }
    if guard.check_host && !headers.get_all(HOST).iter().all(is_rebinding_safe_host) {
        debug!(path, "local API refused a request with a non-local Host");
        return forbidden(
            r#"{"error":"forbidden: use localhost or an IP address as the Host to reach the local API"}"#,
        );
    }
    next.run(req).await
}

fn forbidden(body: &'static str) -> Response {
    (
        StatusCode::FORBIDDEN,
        [(CONTENT_TYPE, "application/json")],
        body,
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn value(v: &str) -> HeaderValue {
        HeaderValue::from_str(v).unwrap()
    }

    #[test]
    fn cors_allows_exact_local_origins() {
        for origin in [
            "http://localhost:1420",
            "https://localhost:3030",
            "tauri://localhost",
            "http://tauri.localhost",
            "http://127.0.0.1:3030",
            "https://127.0.0.1:3030",
        ] {
            assert!(is_allowed_local_origin(&value(origin)), "{origin}");
        }
    }

    #[test]
    fn cors_rejects_localhost_prefix_origins() {
        for origin in [
            "http://localhost.evil.example",
            "https://localhost.evil.example",
            "http://localhost@evil.example",
            "http://127.0.0.1.evil.example",
            "http://tauri.localhost.evil.example",
            "null",
        ] {
            assert!(!is_allowed_local_origin(&value(origin)), "{origin}");
        }
    }

    #[test]
    fn extension_origins_reach_only_the_bridge_and_liveness_probe() {
        let extension = value("chrome-extension://abcdefghijklmnop");
        for path in [
            "/health",
            "/browser/ws",
            "/connections/browser/ws",
            "/connections/browser/status",
            "/connections/browser/pair/start",
        ] {
            assert!(is_allowed_origin(path, &extension), "{path}");
        }
        for path in [
            "/search",
            "/raw_sql",
            "/pipes/store/install",
            "/connections/browsers/user/eval",
            "/browserx/ws",
            "/connections/browser",
        ] {
            assert!(!is_allowed_origin(path, &extension), "{path}");
        }
        assert!(is_allowed_origin(
            "/browser/ws",
            &value("moz-extension://01234567-89ab-cdef-0123-456789abcdef")
        ));
    }

    #[test]
    fn web_origins_are_refused_on_every_route() {
        for origin in [
            "https://evil.example",
            "null",
            "file://",
            "http://192.168.1.5:3030",
        ] {
            for path in ["/health", "/browser/ws", "/search"] {
                assert!(!is_allowed_origin(path, &value(origin)), "{origin} {path}");
            }
        }
    }

    #[test]
    fn host_accepts_only_names_dns_rebinding_cannot_control() {
        for host in [
            "localhost",
            "localhost:3030",
            "LOCALHOST:3030",
            "127.0.0.1:3030",
            "[::1]:3030",
            "[::1]",
            "0.0.0.0:3030",
            "192.168.1.5:3030",
        ] {
            assert!(is_rebinding_safe_host(&value(host)), "{host}");
        }
        for host in [
            "evil.example",
            "evil.example:3030",
            "localhost.evil.example:3030",
            "tauri.localhost:3030",
            "foo.localhost:3030",
            "localhost.:3030",
            "mymac.local:3030",
            "evil.example@localhost:3030",
            "localhost@evil.example:3030",
            "localhost:port",
            "[::1",
            "",
        ] {
            assert!(!is_rebinding_safe_host(&value(host)), "{host}");
        }
    }
}
