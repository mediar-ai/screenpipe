use parking_lot::RwLock;
use std::any::{Any, TypeId};
use std::collections::HashMap;
use tokio::sync::broadcast;

pub struct EventSystem {
    channels: RwLock<HashMap<TypeId, Box<dyn Any + Send + Sync>>>,
}

impl EventSystem {
    pub fn new() -> Self {
        EventSystem {
            channels: RwLock::new(HashMap::new()),
        }
    }

    pub fn subscribe<T: 'static + Clone + Send + Sync>(&self) -> broadcast::Receiver<T> {
        let type_id = TypeId::of::<T>();
        let mut channels = self.channels.write();

        let channel = channels
            .entry(type_id)
            .or_insert_with(|| Box::new(broadcast::channel::<T>(100).0))
            .downcast_ref::<broadcast::Sender<T>>()
            .expect("Failed to downcast channel");

        channel.subscribe()
    }

    pub fn publish<T: 'static + Clone + Send + Sync>(&self, event: T) {
        let type_id = TypeId::of::<T>();
        let channels = self.channels.read();

        if let Some(channel) = channels.get(&type_id) {
            if let Some(sender) = channel.downcast_ref::<broadcast::Sender<T>>() {
                let _ = sender.send(event);
            }
        }
    }
}
