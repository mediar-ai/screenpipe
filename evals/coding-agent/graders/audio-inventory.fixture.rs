// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
#[cfg(test)]
mod eval_audio_inventory {
    use super::*;
    use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
    fn device(name: &str, output: bool) -> AudioDevice {
        AudioDevice::new(
            name.into(),
            if output {
                DeviceType::Output
            } else {
                DeviceType::Input
            },
        )
    }
    async fn inventory(
        cache: &AsyncMutex<Option<CachedDevices>>,
        generation: &AtomicU64,
        calls: &AtomicUsize,
        devices: Vec<AudioDevice>,
    ) -> Vec<AudioDevice> {
        list_audio_devices_with_cache(
            cache,
            || generation.load(Ordering::Acquire),
            || async {
                calls.fetch_add(1, Ordering::Relaxed);
                tokio::task::yield_now().await;
                Ok(devices)
            },
        )
        .await
        .unwrap()
    }
    #[tokio::test]
    async fn unique_inventory_and_cached_result() {
        let cache = AsyncMutex::new(None);
        let gen = AtomicU64::new(0);
        let calls = AtomicUsize::new(0);
        let a = device("Zebra headset", false);
        let b = device("Desk mic", false);
        let c = device("Zebra headset", true);
        let expected = vec![a.clone(), b.clone(), c.clone()];
        let actual = inventory(&cache, &gen, &calls, vec![a.clone(), b, a, c.clone(), c]).await;
        assert_eq!(
            actual, expected,
            "duplicate name+direction entries must appear once in first-seen order"
        );
        assert_eq!(
            inventory(&cache, &gen, &calls, vec![]).await,
            expected,
            "cache hit must retain unique inventory"
        );
        assert_eq!(
            calls.load(Ordering::Relaxed),
            1,
            "cache hit must not enumerate again"
        );
    }
    #[tokio::test]
    async fn refreshed_duplicates_and_removed_devices() {
        let cache = AsyncMutex::new(None);
        let gen = AtomicU64::new(0);
        let calls = AtomicUsize::new(0);
        inventory(&cache, &gen, &calls, vec![device("Old mic", false)]).await;
        gen.fetch_add(1, Ordering::Release);
        let a = device("New mic", false);
        let b = device("New mic", true);
        assert_eq!(
            inventory(
                &cache,
                &gen,
                &calls,
                vec![b.clone(), a.clone(), b.clone(), a.clone()]
            )
            .await,
            vec![b, a],
            "topology refresh must replace old inventory and deduplicate new entries"
        );
        gen.fetch_add(1, Ordering::Release);
        assert!(inventory(&cache, &gen, &calls, vec![]).await.is_empty());
        assert!(
            inventory(&cache, &gen, &calls, vec![device("Unobserved", false)])
                .await
                .is_empty()
        );
        assert_eq!(calls.load(Ordering::Relaxed), 3);
    }
    #[tokio::test]
    async fn exact_names_directions_and_order_preserved() {
        let cache = AsyncMutex::new(None);
        let gen = AtomicU64::new(0);
        let calls = AtomicUsize::new(0);
        let expected = vec![
            device("zeta", true),
            device("Alpha", false),
            device("alpha", false),
            device("Alpha ", false),
            device("Alpha", true),
        ];
        assert_eq!(
            inventory(&cache, &gen, &calls, expected.clone()).await,
            expected,
            "distinct exact names and directions must not be merged or sorted"
        );
    }
    #[tokio::test]
    async fn empty_and_single_inventory_preserved() {
        let cache = AsyncMutex::new(None);
        let gen = AtomicU64::new(0);
        let calls = AtomicUsize::new(0);
        assert!(inventory(&cache, &gen, &calls, vec![]).await.is_empty());
        gen.fetch_add(1, Ordering::Release);
        assert_eq!(
            inventory(&cache, &gen, &calls, vec![device("Single", false)]).await,
            vec![device("Single", false)]
        );
    }
    #[tokio::test]
    async fn ttl_expiry_and_failed_refresh_retry() {
        let cache = AsyncMutex::new(Some(CachedDevices {
            devices: vec![device("Stale", false)],
            fetched_at: Instant::now() - DEVICE_CACHE_TTL,
            topology_generation: 0,
        }));
        let gen = AtomicU64::new(0);
        let calls = AtomicUsize::new(0);
        assert_eq!(
            inventory(&cache, &gen, &calls, vec![device("Fresh", false)]).await,
            vec![device("Fresh", false)]
        );
        gen.fetch_add(1, Ordering::Release);
        let failed = list_audio_devices_with_cache(
            &cache,
            || gen.load(Ordering::Acquire),
            || async { Err(anyhow!("synthetic enumeration failure")) },
        )
        .await;
        assert!(failed.is_err(), "enumeration errors must propagate");
        assert_eq!(
            inventory(&cache, &gen, &calls, vec![device("Retry", false)]).await,
            vec![device("Retry", false)],
            "failed refresh must remain retryable"
        );
        assert_eq!(calls.load(Ordering::Relaxed), 2);
    }
    #[tokio::test]
    async fn concurrent_readers_share_one_enumeration() {
        let cache = AsyncMutex::new(None);
        let gen = AtomicU64::new(0);
        let calls = AtomicUsize::new(0);
        let expected = vec![device("Shared", false)];
        let results = futures::future::join_all(
            (0..8).map(|_| inventory(&cache, &gen, &calls, expected.clone())),
        )
        .await;
        assert!(results.iter().all(|v| v == &expected));
        assert_eq!(
            calls.load(Ordering::Relaxed),
            1,
            "concurrent readers must coalesce"
        );
    }
    #[tokio::test]
    async fn change_during_enumeration_requires_following_refresh() {
        let cache = AsyncMutex::new(None);
        let gen = AtomicU64::new(0);
        let calls = AtomicUsize::new(0);
        list_audio_devices_with_cache(
            &cache,
            || gen.load(Ordering::Acquire),
            || async {
                gen.fetch_add(1, Ordering::Release);
                Ok(vec![device("Old", false)])
            },
        )
        .await
        .unwrap();
        assert_eq!(
            inventory(&cache, &gen, &calls, vec![device("New", false)]).await,
            vec![device("New", false)]
        );
        assert_eq!(
            calls.load(Ordering::Relaxed),
            1,
            "event during enumeration cannot be consumed early"
        );
    }
}
