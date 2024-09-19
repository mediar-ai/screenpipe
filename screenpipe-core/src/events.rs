use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::marker::PhantomData;

pub trait EventPayload:
    Serialize + for<'de> Deserialize<'de> + Clone + Send + Sync + 'static
{
}

#[derive(Debug, Clone, Serialize)]
pub struct Event<T: EventPayload> {
    pub timestamp: DateTime<Utc>,
    pub payload: T,
}

// wrapper for deserialization
#[derive(Deserialize)]
struct EventWrapper<T> {
    timestamp: DateTime<Utc>,
    payload: T,
    #[serde(skip)]
    _marker: PhantomData<T>,
}

impl<'de, T: EventPayload> Deserialize<'de> for Event<T> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let wrapper = EventWrapper::<T>::deserialize(deserializer)?;
        Ok(Event {
            timestamp: wrapper.timestamp,
            payload: wrapper.payload,
        })
    }
}
