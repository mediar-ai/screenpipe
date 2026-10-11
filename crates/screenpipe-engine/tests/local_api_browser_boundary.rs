// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! A web page the user visits must not be able to read or drive the local
//! API, either cross-site or through DNS rebinding. These tests serve the full
//! router over TCP so `Host`, `Origin`, and WebSocket handshakes are exactly
//! what a client sends.

use std::{
    collections::HashMap,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
};

use reqwest::{header, Method, StatusCode};
use screenpipe_audio::audio_manager::AudioManagerBuilder;
use screenpipe_core::pipes::PipeManager;
use screenpipe_db::DatabaseManager;
use screenpipe_engine::SCServer;
use tokio_tungstenite::tungstenite::{self, client::IntoClientRequest};

const KEY: &str = "boundary-test-key";
const WEB_PAGE: &str = "https://evil.example";
const WEBVIEW: &str = "tauri://localhost";
const EXTENSION: &str = "chrome-extension://abcdefghijklmnop";
const SEARCH: &str = "/search?content_type=ocr&limit=5";
const PIPE_MD: &str = "---\nschedule: manual\nenabled: false\n---\n\nSummarize the day.\n";

struct Api {
    base: String,
    port: u16,
    pipe_md: PathBuf,
    client: reqwest::Client,
    _dir: tempfile::TempDir,
}

struct Options {
    auth: bool,
    /// The address the server believes it is bound to. Tests always listen on
    /// loopback; a LAN bind is simulated so no test opens a network port.
    bind: SocketAddr,
}

fn loopback() -> Options {
    Options {
        auth: false,
        bind: ([127, 0, 0, 1], 3030).into(),
    }
}

async fn serve(options: Options) -> Api {
    let dir = tempfile::tempdir().unwrap();
    let db = Arc::new(
        DatabaseManager::new_hybrid(dir.path(), Default::default(), Default::default())
            .await
            .unwrap(),
    );
    let audio = Arc::new(
        AudioManagerBuilder::new()
            .is_disabled(true)
            .output_path(dir.path().join("audio"))
            .build(db.clone())
            .await
            .unwrap(),
    );
    let pipe_md = write_pipe(&dir.path().join("pipes"), "storefront");
    write_pipe(&dir.path().join("pipes"), "store");
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let pipes = PipeManager::new(dir.path().join("pipes"), HashMap::new(), None, port);
    pipes.load_pipes().await.unwrap();
    let mut server = SCServer::new(
        db,
        options.bind,
        dir.path().to_path_buf(),
        true,
        true,
        audio,
        false,
        "balanced".into(),
    )
    .with_pipe_manager(Arc::new(tokio::sync::Mutex::new(pipes)));
    server.api_auth = options.auth;
    server.api_auth_key = Some(KEY.into());
    let router = server.try_create_router().await.unwrap();
    tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
    Api {
        base: format!("http://127.0.0.1:{port}"),
        port,
        pipe_md,
        client: reqwest::Client::new(),
        _dir: dir,
    }
}

fn write_pipe(pipes_dir: &Path, name: &str) -> PathBuf {
    let dir = pipes_dir.join(name);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("pipe.md");
    std::fs::write(&path, PIPE_MD).unwrap();
    path
}

impl Api {
    async fn send(
        &self,
        method: Method,
        path: &str,
        headers: &[(&str, &str)],
    ) -> reqwest::Response {
        let mut request = self.client.request(method, format!("{}{path}", self.base));
        for (name, value) in headers {
            request = request.header(*name, *value);
        }
        request.send().await.unwrap()
    }

    async fn status(&self, method: Method, path: &str, headers: &[(&str, &str)]) -> StatusCode {
        self.send(method, path, headers).await.status()
    }

    async fn preflight(&self, path: &str, origin: &str) -> reqwest::Response {
        self.send(
            Method::OPTIONS,
            path,
            &[
                ("origin", origin),
                ("access-control-request-method", "POST"),
                ("access-control-request-headers", "content-type"),
            ],
        )
        .await
    }

    async fn websocket(&self, path: &str, origin: &str) -> Result<(), StatusCode> {
        let mut request = format!("ws://127.0.0.1:{}{path}", self.port)
            .into_client_request()
            .unwrap();
        request
            .headers_mut()
            .insert(header::ORIGIN, origin.parse().unwrap());
        match tokio_tungstenite::connect_async(request).await {
            Ok(_) => Ok(()),
            Err(tungstenite::Error::Http(response)) => Err(response.status()),
            Err(error) => panic!("websocket {path}: {error}"),
        }
    }
}

#[tokio::test]
async fn web_pages_cannot_read_history_or_run_sql_when_auth_is_off() {
    let api = serve(loopback()).await;
    assert_eq!(api.status(Method::GET, SEARCH, &[]).await, StatusCode::OK);

    let refused = api.send(Method::GET, SEARCH, &[("origin", WEB_PAGE)]).await;
    assert_eq!(refused.status(), StatusCode::FORBIDDEN);
    assert!(refused.text().await.unwrap().contains("web pages"));

    // A text/plain POST is a CORS "simple request": no preflight, so before
    // this guard the handler ran even though the page could not read the reply.
    let raw_sql = api
        .client
        .post(format!("{}/raw_sql", api.base))
        .header("origin", WEB_PAGE)
        .header("content-type", "text/plain")
        .body(r#"{"query":"SELECT 1 LIMIT 1"}"#)
        .send()
        .await
        .unwrap();
    assert_eq!(raw_sql.status(), StatusCode::FORBIDDEN);

    // The webview keeps working, including CORS preflights.
    assert_eq!(
        api.status(Method::GET, SEARCH, &[("origin", WEBVIEW)])
            .await,
        StatusCode::OK
    );
    assert_eq!(
        api.preflight("/raw_sql", WEB_PAGE).await.status(),
        StatusCode::FORBIDDEN
    );
    let allowed = api.preflight("/raw_sql", WEBVIEW).await;
    assert!(allowed.status().is_success(), "{}", allowed.status());
    assert_eq!(
        allowed.headers()[header::ACCESS_CONTROL_ALLOW_ORIGIN],
        WEBVIEW
    );
}

#[tokio::test]
async fn auth_exempt_routes_are_closed_to_web_pages() {
    let api = serve(Options {
        auth: true,
        ..loopback()
    })
    .await;
    assert_eq!(
        api.status(Method::GET, "/health", &[]).await,
        StatusCode::OK
    );
    assert_eq!(
        api.status(
            Method::GET,
            "/health",
            &[("origin", "http://tauri.localhost")]
        )
        .await,
        StatusCode::OK
    );
    for origin in [WEB_PAGE, "null"] {
        for path in ["/health", "/pipes/store/check-updates"] {
            assert_eq!(
                api.status(Method::GET, path, &[("origin", origin)]).await,
                StatusCode::FORBIDDEN,
                "{origin} {path}"
            );
        }
    }
}

#[tokio::test]
async fn dns_rebinding_hostnames_are_refused_on_loopback_binds() {
    let api = serve(loopback()).await;
    let port = api.port;
    // After rebinding, the page is same-origin with the API: its GETs carry
    // no Origin, only the attacker's hostname.
    let rebound = format!("rebind.evil.example:{port}");
    let refused = api
        .send(Method::GET, SEARCH, &[("host", rebound.as_str())])
        .await;
    assert_eq!(refused.status(), StatusCode::FORBIDDEN);
    assert!(refused.text().await.unwrap().contains("Host"));

    for host in [
        format!("localhost:{port}"),
        format!("127.0.0.1:{port}"),
        format!("[::1]:{port}"),
    ] {
        assert_eq!(
            api.status(Method::GET, SEARCH, &[("host", host.as_str())])
                .await,
            StatusCode::OK,
            "{host}"
        );
    }
}

#[tokio::test]
async fn lan_binds_accept_network_hostnames_but_still_refuse_web_pages() {
    let api = serve(Options {
        auth: true,
        bind: ([0, 0, 0, 0], 3030).into(),
    })
    .await;
    let bearer = format!("Bearer {KEY}");
    let lan_host = format!("studio-mac.local:{}", api.port);
    let authorized = [
        ("host", lan_host.as_str()),
        ("authorization", bearer.as_str()),
    ];
    assert_eq!(
        api.status(Method::GET, SEARCH, &authorized).await,
        StatusCode::OK
    );

    let mut from_web_page = authorized.to_vec();
    from_web_page.push(("origin", WEB_PAGE));
    assert_eq!(
        api.status(Method::GET, SEARCH, &from_web_page).await,
        StatusCode::FORBIDDEN
    );
}

#[tokio::test]
async fn websocket_handshakes_from_web_pages_are_refused() {
    let api = serve(loopback()).await;
    for path in ["/ws/health", "/ws/events"] {
        assert_eq!(
            api.websocket(path, WEB_PAGE).await,
            Err(StatusCode::FORBIDDEN),
            "{path}"
        );
    }
    assert_eq!(api.websocket("/ws/health", WEBVIEW).await, Ok(()));

    // The browser extension keeps its bridge, and only its bridge.
    assert_eq!(
        api.websocket("/connections/browser/ws", EXTENSION).await,
        Ok(())
    );
    assert_eq!(
        api.websocket("/ws/events", EXTENSION).await,
        Err(StatusCode::FORBIDDEN)
    );
    assert_eq!(
        api.status(
            Method::GET,
            "/connections/browser/status",
            &[("origin", EXTENSION)]
        )
        .await,
        StatusCode::OK
    );
    assert_eq!(
        api.status(Method::GET, SEARCH, &[("origin", EXTENSION)])
            .await,
        StatusCode::FORBIDDEN
    );
}

#[tokio::test]
async fn pipes_named_like_the_store_require_auth() {
    let api = serve(Options {
        auth: true,
        ..loopback()
    })
    .await;
    let bearer = format!("Bearer {KEY}");

    assert_eq!(
        api.status(
            Method::GET,
            "/pipes/storefront/logs",
            &[("authorization", bearer.as_str())]
        )
        .await,
        StatusCode::OK,
        "fixture pipe must be routable"
    );
    for (method, path) in [
        (Method::GET, "/pipes/storefront/logs"),
        (Method::GET, "/pipes/storefront/executions"),
        (Method::GET, "/pipes/storefront/stream"),
        (Method::POST, "/pipes/storefront/run"),
        // A pipe named exactly `store` shares the registry's path prefix.
        (Method::GET, "/pipes/store/executions/1"),
        (Method::GET, "/pipes/store/session/1"),
        (Method::GET, "/pipes/store/stream"),
    ] {
        assert_eq!(
            api.status(method, path, &[]).await,
            StatusCode::FORBIDDEN,
            "{path}"
        );
    }

    let rewrite = api
        .client
        .post(format!("{}/pipes/storefront/config", api.base))
        .json(&serde_json::json!({
            "raw_content": "---\nschedule: every 5m\nenabled: true\n---\n\nReplaced.\n"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(rewrite.status(), StatusCode::FORBIDDEN);
    assert_eq!(std::fs::read_to_string(&api.pipe_md).unwrap(), PIPE_MD);

    // The store itself stays reachable before the webview has its key.
    assert_eq!(
        api.status(Method::GET, "/pipes/store/check-updates", &[])
            .await,
        StatusCode::OK
    );
}
