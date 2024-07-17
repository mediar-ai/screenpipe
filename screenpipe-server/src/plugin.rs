use futures::future::BoxFuture;
use std::task::{Context, Poll};
use tower::{Layer, Service};

#[derive(Clone)]
pub struct ApiPluginLayer<F> {
    plugin: F,
}

impl<F> ApiPluginLayer<F>
where
    F: Clone,
{
    pub fn new(plugin: F) -> Self {
        Self { plugin }
    }
}

impl<S, F> Layer<S> for ApiPluginLayer<F>
where
    F: Clone + Send + Sync + 'static,
{
    type Service = ApiPluginService<S, F>;

    fn layer(&self, service: S) -> <Self as Layer<S>>::Service {
        ApiPluginService {
            inner: service,
            plugin: self.plugin.clone(),
        }
    }
}

#[derive(Clone)]
pub struct ApiPluginService<S, F> {
    inner: S,
    plugin: F,
}

impl<S, F, R> Service<R> for ApiPluginService<S, F>
where
    S: Service<R> + Clone + Send + 'static,
    F: Fn(&R) + Clone + Send + Sync + 'static,
    R: Send + 'static,
    S::Future: Send,
{
    type Response = S::Response;
    type Error = S::Error;
    type Future = BoxFuture<'static, Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, request: R) -> Self::Future {
        let plugin = self.plugin.clone();
        let mut inner = self.inner.clone();
        plugin(&request);
        Box::pin(async move { inner.call(request).await })
    }
}
