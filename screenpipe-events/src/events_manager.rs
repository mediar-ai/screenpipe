use anyhow::Result;
use futures::{Stream, StreamExt};
use lazy_static::lazy_static;
use serde_json::Value;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;

lazy_static! {
    static ref EVENT_MANAGER: EventManager = EventManager::new();
}

#[derive(Clone, Debug)]
pub struct Event {
    pub name: String,
    pub data: Value,
}

pub struct EventManager {
    sender: broadcast::Sender<Event>,
}

impl EventManager {
    fn new() -> Self {
        let (sender, _) = broadcast::channel(usize::MAX / 2 - 1);
        Self { sender }
    }

    pub fn instance() -> &'static EventManager {
        &EVENT_MANAGER
    }

    pub async fn send(&self, name: impl Into<String>, data: impl Into<Value>) -> Result<()> {
        self.sender.send(Event {
            name: name.into(),
            data: data.into(),
        })?;
        Ok(())
    }

    pub fn subscribe_all(&self) -> broadcast::Receiver<Event> {
        self.sender.subscribe()
    }

    pub async fn subscribe(&self, name: String) -> impl Stream<Item = Value> {
        let rx = self.sender.subscribe();
        BroadcastStream::new(rx).filter_map(move |result| {
            futures::future::ready({
                let event = result.ok().unwrap();
                (event.name == name).then_some(event.data)
            })
        })
    }
}
