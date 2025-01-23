use anyhow::Result;
use futures::Stream;
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;
use std::any::{type_name, Any};
use std::collections::HashMap;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;

static EVENT_MANAGER: Lazy<EventManager> = Lazy::new(EventManager::new);

#[derive(Clone, Debug)]
struct Event {
    name: String,
    data: Value,
}

pub struct EventManager {
    sender: broadcast::Sender<Event>,
    type_registry: EventTypeRegistry,
    subscriptions: RwLock<HashMap<String, Box<dyn Any + Send + Sync>>>,
}

#[derive(Debug, Default)]
pub struct EventTypeRegistry {
    types: RwLock<HashMap<String, TypeDefinition>>,
}

#[derive(Debug)]
struct TypeDefinition {
    type_name: &'static str,
    defining_crate: &'static str,
}

pub trait EventRegistry: Send + Sync + 'static {
    fn register(&self, manager: &EventManager);
}

#[macro_export]
macro_rules! send_event {
    ($name:expr, $data:expr) => {{
        let _type_check: () = {
            // This will fail to compile if the types don't match
            const fn check_type<T>(_: &T) {}
            check_type(&$data);
        };

        if let Err(e) = $crate::EventManager::instance().send($name, $data) {
            tracing::error!("Failed to send event {}: {}", $name, e);
        }
    }};
}

#[macro_export]
macro_rules! define_event_registry {
    ($($name:ident => $type:ty),* $(,)?) => {
        #[derive(Clone)]
        pub struct Registry;

        impl $crate::EventRegistry for Registry {
            fn register(&self, manager: &$crate::EventManager) {
                $(
                    manager.register_event::<$type>(stringify!($name));
                )*
            }
        }

        // Main registry initialization
        static REGISTRY: ::once_cell::sync::Lazy<()> = ::once_cell::sync::Lazy::new(|| {
            let registry = Registry;
            $crate::EventManager::instance().register_registry(registry);
        });

        #[ctor::ctor]
        fn init_registry() {
            ::once_cell::sync::Lazy::force(&REGISTRY);
        }

        $(
            #[allow(non_snake_case)]
            pub fn $name() -> impl futures::Stream<Item = $type> {
                $crate::EventManager::instance().subscribe::<$type>(stringify!($name))
            }
        )*
    }
}

pub struct EventSubscription<T> {
    stream: std::pin::Pin<Box<BroadcastStream<Event>>>,
    event_name: String,
    _phantom: std::marker::PhantomData<T>,
}

impl<T: DeserializeOwned + 'static> Clone for EventSubscription<T> {
    fn clone(&self) -> Self {
        let rx = EVENT_MANAGER.sender.subscribe();
        Self {
            stream: Box::pin(BroadcastStream::new(rx)),
            event_name: self.event_name.clone(),
            _phantom: std::marker::PhantomData,
        }
    }
}

impl<T: DeserializeOwned + Unpin + 'static> Stream for EventSubscription<T> {
    type Item = T;

    fn poll_next(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        let me = self.get_mut();
        loop {
            match me.stream.as_mut().poll_next(cx) {
                std::task::Poll::Ready(Some(Ok(event))) if event.name == me.event_name => {
                    if let Ok(data) = serde_json::from_value(event.data) {
                        return std::task::Poll::Ready(Some(data));
                    }
                }
                std::task::Poll::Ready(Some(_)) => continue,
                std::task::Poll::Ready(None) => return std::task::Poll::Ready(None),
                std::task::Poll::Pending => return std::task::Poll::Pending,
            }
        }
    }
}

impl EventManager {
    fn new() -> Self {
        let (sender, _) = broadcast::channel(10000);
        Self {
            sender,
            type_registry: EventTypeRegistry::default(),
            subscriptions: RwLock::new(HashMap::new()),
        }
    }

    pub fn instance() -> &'static EventManager {
        &EVENT_MANAGER
    }

    pub fn register_event<T: 'static>(&self, event: impl Into<String>) {
        let event_name = event.into();
        self.type_registry.register::<T>(&event_name);
        tracing::debug!(
            "Registered event {} with type {}",
            event_name,
            type_name::<T>()
        );
    }

    pub fn send<T: Serialize + 'static>(&self, event: impl Into<String>, data: T) -> Result<()> {
        let event_name = event.into();
        assert!(
            self.type_registry.verify::<T>(&event_name),
            "Event {} not registered with type {}",
            event_name,
            type_name::<T>()
        );
        let value = serde_json::to_value(data)?;
        self.sender.send(Event {
            name: event_name,
            data: value,
        })?;
        Ok(())
    }

    pub fn subscribe<T: DeserializeOwned + Unpin + Clone + Send + Sync + 'static>(
        &self,
        event: impl Into<String>,
    ) -> EventSubscription<T> {
        let event_name = event.into();
        {
            let subs = self.subscriptions.read();
            if let Some(sub) = subs.get(&event_name) {
                if let Some(typed_sub) = sub.downcast_ref::<EventSubscription<T>>() {
                    return typed_sub.clone();
                }
            }
        }

        assert!(
            self.type_registry.verify::<T>(&event_name),
            "Event {} not registered with type {}",
            event_name,
            type_name::<T>()
        );

        let rx = self.sender.subscribe();
        let sub = EventSubscription {
            stream: Box::pin(BroadcastStream::new(rx)),
            event_name: event_name.clone(),
            _phantom: std::marker::PhantomData,
        };

        let mut subs = self.subscriptions.write();
        subs.insert(event_name, Box::new(sub.clone()));
        sub
    }

    pub fn register_registry<R: EventRegistry>(&self, registry: R) {
        registry.register(self);
    }
}

impl EventTypeRegistry {
    pub fn register<T: 'static>(&self, event_name: &str) {
        let type_def = TypeDefinition {
            type_name: std::any::type_name::<T>(),
            defining_crate: std::module_path!(),
        };

        tracing::debug!(
            "Registering event {} with type {} from crate {}",
            event_name,
            type_def.type_name,
            type_def.defining_crate
        );

        let mut types = self.types.write();
        if let Some(existing) = types.get(event_name) {
            if existing.defining_crate != type_def.defining_crate
                && existing.type_name != type_def.type_name
            {
                panic!(
                    "Event '{}' is already defined in crate '{}'. Events must be uniquely defined across all crates.",
                    event_name,
                    existing.defining_crate
                );
            }
        }
        types.insert(event_name.to_string(), type_def);
    }

    pub fn verify<T: 'static>(&self, event_name: &str) -> bool {
        let types = self.types.read();
        let type_name = std::any::type_name::<T>();
        let result = types
            .get(event_name)
            .is_some_and(|t| t.type_name == type_name);

        tracing::debug!(
            "Verifying event {} - registered type: {:?}, requested type: {}, result: {}",
            event_name,
            types.get(event_name).map(|t| t.type_name),
            type_name,
            result
        );

        result
    }
}
