use anyhow::{Result, anyhow};
use tracing::{debug, error};
use atspi::{
    connection::set_session_accessibility,
    proxy::accessible::{AccessibleProxy, ObjectRefExt},
    zbus::{proxy::CacheProperties, Connection},
    AccessibilityConnection, RelationType, Role,
};
use atspi_proxies::document::DocumentProxy;
use atspi_common::State;
use zbus::fdo::DBusProxy;

use super::BrowserUrlDetector;

const REGISTRY_DEST: &str = "org.a11y.atspi.Registry";
const REGISTRY_PATH: &str = "/org/a11y/atspi/accessible/root";
const ACCCESSIBLE_INTERFACE: &str = "org.a11y.atspi.Accessible";

pub struct LinuxUrlDetector;

impl LinuxUrlDetector {
    pub fn new() -> Self {
        Self
    }

    async fn setup_connection() -> Result<(AccessibilityConnection, AccessibleProxy<'static>)> {
        // Enable accessibility for the session
        set_session_accessibility(true).await?;

        // Create a connection to the accessibility bus
        let connection = AccessibilityConnection::new().await?;

        // Get the root accessible object
        let root = Self::get_registry_accessible(connection.connection()).await?;

        Ok((connection, root))
    }

    async fn get_registry_accessible(conn: &Connection) -> Result<AccessibleProxy<'static>> {
        let registry = AccessibleProxy::builder(conn)
            .destination(REGISTRY_DEST)?
            .path(REGISTRY_PATH)?
            .interface(ACCCESSIBLE_INTERFACE)?
            .cache_properties(CacheProperties::No)
            .build()
            .await?;

        Ok(registry)
    }

    async fn find_browser_process<'a>(
        conn: &'a Connection,
        root: &AccessibleProxy<'_>,
        target_pid: i32,
    ) -> Result<AccessibleProxy<'a>> {
        let child_objects = root.get_children().await?;
        let dbus_proxy = DBusProxy::new(conn).await?;

        for child in child_objects {
            let proxy = child.into_accessible_proxy(conn).await?;
            if let Ok(application) = proxy.get_application().await {
                // First get the unique bus name
                if let Ok(unique_name) = dbus_proxy.get_name_owner((&application.name).into()).await {
                    // Then get the process ID using the unique bus name
                    if let Ok(pid) = dbus_proxy.get_connection_unix_process_id(unique_name.into()).await {
                        if pid == target_pid as u32 {
                            debug!("Found browser process (PID: {})", pid);
                            return Ok(proxy);
                        }
                    }
                }
            }
        }

        Err(anyhow!("No browser process found with PID {}", target_pid))
    }

    async fn find_active_frame<'a>(
        conn: &'a Connection,
        browser_proxy: &AccessibleProxy<'_>,
    ) -> Result<Option<AccessibleProxy<'a>>> {
        let frames = browser_proxy.get_children().await?;
        
        for frame in frames {
            let frame_proxy = frame.into_accessible_proxy(conn).await?;
            if frame_proxy.get_role().await? == Role::Frame {
                let state = frame_proxy.get_state().await?;
                // Check if any of the states we care about are set
                if state.contains(State::Focused) || 
                   state.contains(State::Active) || 
                   state.contains(State::Selected) {
                    debug!("Found active frame: {}", frame_proxy.name().await.unwrap_or_default());
                    return Ok(Some(frame_proxy));
                }
            }
        }
        Ok(None)
    }

    async fn get_embed_relation<'a>(
        conn: &'a Connection,
        frame_proxy: &AccessibleProxy<'_>,
    ) -> Result<Vec<AccessibleProxy<'a>>> {
        let relation_set = frame_proxy.get_relation_set().await?;
        let embed_targets = relation_set
            .into_iter()
            .find(|(relation_type, _)| *relation_type == RelationType::Embeds)
            .map(|(_, targets)| targets)
            .ok_or_else(|| anyhow!("No embed relation found"))?;

        let mut accessible_proxies = Vec::new();
        for target in embed_targets {
            let proxy = AccessibleProxy::builder(conn)
                .destination(target.name.to_string())?
                .path(target.path.to_string())?
                .interface(ACCCESSIBLE_INTERFACE)?
                .build()
                .await?;
            accessible_proxies.push(proxy);
        }
        Ok(accessible_proxies)
    }

    async fn create_document_proxy<'a>(
        conn: &'a Connection,
        document_proxy: &AccessibleProxy<'_>,
    ) -> Result<DocumentProxy<'a>> {
        let inner = document_proxy.inner();
        DocumentProxy::builder(conn)
            .destination(inner.destination().to_string())?
            .path(inner.path().to_string())?
            .interface("org.a11y.atspi.Document")?
            .build()
            .await
            .map_err(|e| anyhow!("Failed to create document proxy: {}", e))
    }

    async fn get_url_from_document(
        document_proxy: &DocumentProxy<'_>,
    ) -> Result<Option<String>> {
        // Try DocURL first
        if let Ok(doc_url) = document_proxy.get_attribute_value("DocURL").await {
            if !doc_url.is_empty() {
                return Ok(Some(doc_url));
            }
        }

        // If DocURL fails or is empty, try URI
        if let Ok(doc_url) = document_proxy.get_attribute_value("URI").await {
            if !doc_url.is_empty() {
                Ok(Some(doc_url))
            } else {
                Ok(None)
            }
        } else {
            Ok(None)
        }
    }

    async fn find_document_web_with_url<'a>(
        conn: &'a Connection,
        targets: Vec<AccessibleProxy<'a>>,
    ) -> Result<AccessibleProxy<'a>> {
        for target in targets {
            if target.get_role().await? == Role::DocumentWeb {
                let doc_proxy = Self::create_document_proxy(conn, &target).await?;
                if let Ok(Some(url)) = Self::get_url_from_document(&doc_proxy).await {
                    debug!("Found DocumentWeb with valid URL: {}", url);
                    return Ok(target);
                }
            }
        }
        Err(anyhow!("No DocumentWeb role found with valid URL"))
    }

    async fn get_document_url_from_relation(
        conn: &Connection,
        frame_proxy: &AccessibleProxy<'_>,
    ) -> Result<Option<String>> {
        let embed_targets = Self::get_embed_relation(conn, frame_proxy).await?;
        let document_proxy = Self::find_document_web_with_url(conn, embed_targets).await?;
        let document = Self::create_document_proxy(conn, &document_proxy).await?;
        Self::get_url_from_document(&document).await
    }

    async fn get_active_url_from_window(pid: i32) -> Result<Option<String>> {
        let (connection, root) = Self::setup_connection().await?;
        let conn = connection.connection();

        match Self::find_browser_process(conn, &root, pid).await {
            Ok(browser_proxy) => {
                // Find the active frame first
                if let Ok(Some(frame_proxy)) = Self::find_active_frame(conn, &browser_proxy).await {
                    match Self::get_document_url_from_relation(conn, &frame_proxy).await {
                        Ok(Some(url)) => {
                            debug!("Found URL: {}", url);
                            Ok(Some(url))
                        }
                        Ok(None) => {
                            debug!("No URL found in active frame");
                            Ok(None)
                        }
                        Err(e) => {
                            error!("Failed to get URL from relation: {}", e);
                            Ok(None)
                        }
                    }
                } else {
                    debug!("No active frame found");
                    Ok(None)
                }
            }
            Err(e) => {
                error!("Could not find browser process: {}", e);
                Ok(None)
            }
        }
    }
}

impl BrowserUrlDetector for LinuxUrlDetector {
    fn get_active_url(&self, _app_name: &str, process_id: i32) -> Result<Option<String>> {
        // Since we're using async functions, we need to block on the runtime
        tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(Self::get_active_url_from_window(process_id))
    }
} 