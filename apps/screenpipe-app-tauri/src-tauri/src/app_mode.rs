// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! Runtime policy selection, independent of installer identity. Selecting managed
//! mode never grants access: native policy and seat verification still own that.

use crate::store::SettingsStore;
use once_cell::sync::Lazy;
use std::sync::atomic::{AtomicBool, Ordering};

// Deployment configuration is immutable for a process. User/account state is
// read live so sign-in can enter managed mode without restarting the app.
static MANAGED_SESSION: AtomicBool = AtomicBool::new(false);

static MANAGED_DEPLOYMENT: Lazy<bool> = Lazy::new(|| {
    let config = crate::commands::get_enterprise_file_config();
    config.license_key.is_some()
        || config.ingest_url.is_some()
        || [
            "SCREENPIPE_ENTERPRISE_LICENSE_KEY",
            "SCREENPIPE_ENTERPRISE_INGEST_URL",
        ]
        .iter()
        .any(|name| std::env::var(name).is_ok_and(|value| !value.trim().is_empty()))
});

pub(crate) fn deployment_or_session_is_managed() -> bool {
    cfg!(feature = "enterprise-build")
        || *MANAGED_DEPLOYMENT
        || MANAGED_SESSION.load(Ordering::SeqCst)
}

pub(crate) fn for_settings(settings: &SettingsStore) -> bool {
    resolve_mode(
        &MANAGED_SESSION,
        cfg!(feature = "enterprise-build"),
        *MANAGED_DEPLOYMENT,
        settings,
    )
}

fn resolve_mode(
    session: &AtomicBool,
    legacy: bool,
    deployment: bool,
    settings: &SettingsStore,
) -> bool {
    let managed = legacy || deployment || settings.requires_enterprise_app_for_consumer();
    // Signing out revokes credentials, never the process's managed policy.
    session.fetch_or(managed, Ordering::SeqCst) || managed
}

pub(crate) fn is_managed(app: &tauri::AppHandle) -> bool {
    match SettingsStore::get(app) {
        Ok(Some(settings)) => for_settings(&settings),
        Ok(None) => {
            MANAGED_SESSION.load(Ordering::SeqCst)
                || cfg!(feature = "enterprise-build")
                || *MANAGED_DEPLOYMENT
        }
        // A failed store read cannot downgrade managed enforcement.
        Err(_) => true,
    }
}

#[cfg(test)]
mod tests {
    use super::resolve_mode;
    use crate::store::SettingsStore;
    use serde_json::json;
    use std::sync::atomic::AtomicBool;

    #[test]
    fn sign_in_enters_managed_mode_and_sign_out_cannot_downgrade_it() {
        let session = AtomicBool::new(false);
        let mut settings = SettingsStore::default();
        assert!(!resolve_mode(&session, false, false, &settings));
        settings.user.enterprise_account = Some(json!({"requires_enterprise_app": true}));
        assert!(resolve_mode(&session, false, false, &settings));
        settings.user = Default::default();
        assert!(resolve_mode(&session, false, false, &settings));
    }

    #[test]
    fn legacy_and_managed_deployments_require_policy_without_an_account() {
        let settings = SettingsStore::default();
        for (legacy, deployment) in [(true, false), (false, true), (true, true)] {
            assert!(resolve_mode(
                &AtomicBool::new(false),
                legacy,
                deployment,
                &settings
            ));
        }
    }

    #[test]
    fn personal_subscription_is_an_opt_out_only_when_the_org_permits_it() {
        let mut settings = SettingsStore::default();
        settings.user.id = Some("personal-subscriber".into());
        settings.user.app_entitled = Some(true);
        settings.user.subscription_plan = Some("standard".into());
        settings.user.enterprise_account = Some(json!({"requires_enterprise_app": true}));
        settings.user.entitlement = Some(json!({
            "active": true, "plan": "standard", "source": "subscription",
            "checked_at": chrono::Utc::now().to_rfc3339(), "features": {"app": true}
        }));
        assert!(!resolve_mode(
            &AtomicBool::new(false),
            false,
            false,
            &settings
        ));
        settings.user.enterprise_account = Some(json!({
            "requires_enterprise_app": true, "restrict_consumer_build_access": true
        }));
        assert!(resolve_mode(
            &AtomicBool::new(false),
            false,
            false,
            &settings
        ));
    }
}
