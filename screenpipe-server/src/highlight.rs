use std::{
    borrow::Cow, error::Error,sync::Arc, time::Duration 
};

pub use opentelemetry::trace::Span as SpanTrait;
use opentelemetry::{
    global,
    trace::{Status, TraceContextExt, Tracer as _},
    KeyValue,
};
use opentelemetry_otlp::{
     OtlpTracePipeline, SpanExporterBuilder, WithExportConfig,
};
use opentelemetry_sdk::{
    propagation::TraceContextPropagator,
    resource::Resource,
    trace::{self, BatchConfig, Span, Tracer},
};

use opentelemetry_semantic_conventions::resource::{SERVICE_NAME, SERVICE_VERSION};

use opentelemetry::{logs::LogError, trace::TraceError};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum HighlightError {
    /// Config error during setup
    #[error("Highlight Config error: {0}")]
    Config(String),

    /// Errors from the log SDK
    #[error(transparent)]
    Log(LogError),

    /// Errors from the trace SDK
    #[error(transparent)]
    Trace(TraceError),
}



impl From<TraceError> for HighlightError {
    fn from(value: TraceError) -> Self {
        HighlightError::Trace(value)
    }
}


pub mod otel {
    pub use opentelemetry::KeyValue;
}

pub struct HighlightConfig {
    /// Your highlight.io Project ID
    pub project_id: String,

    /// The name of your app.
    pub service_name: Option<String>,

    /// The version of your app. We recommend setting this to the most recent deploy SHA of your app.
    pub service_version: Option<String>,

}

impl Default for HighlightConfig {
    fn default() -> Self {
        Self {
            project_id: Default::default(),
            service_name: Default::default(),
            service_version: Default::default(),
        }
    }
}

struct HighlightInner {
    config: HighlightConfig,
    tracer: Tracer,
}

#[derive(Clone)]
pub struct Highlight(Arc<HighlightInner>);

impl Highlight {
    fn install_pipelines(
        tracing: OtlpTracePipeline<SpanExporterBuilder>,
    ) -> Result<Tracer, HighlightError> {
        Ok(
            tracing.install_batch(opentelemetry_sdk::runtime::Tokio)?,
        )
    }

    fn get_default_resource(config: &HighlightConfig) -> Resource {
        let mut attrs = Vec::with_capacity(2);
        attrs.push(KeyValue::new(
            "highlight.project_id",
            config.project_id.clone(),
        ));

        if let Some(service_name) = &config.service_name {
            attrs.push(KeyValue::new(SERVICE_NAME, service_name.to_owned()));
        }

        if let Some(service_version) = &config.service_version {
            attrs.push(KeyValue::new(SERVICE_VERSION, service_version.to_owned()));
        }

        Resource::new(attrs)
    }

    fn make_install_pipelines(
        config: &HighlightConfig,
    ) -> Result<Tracer, HighlightError> {
        let tracing = opentelemetry_otlp::new_pipeline()
            .tracing()
            .with_trace_config(
                trace::config()
                    .with_sampler(trace::Sampler::AlwaysOn)
                    .with_resource(Self::get_default_resource(config)),
            )
            .with_batch_config(
                BatchConfig::default()
                    .with_scheduled_delay(Duration::from_millis(1000))
                    .with_max_export_batch_size(128)
                    .with_max_queue_size(1024),
            )
            .with_exporter(
                opentelemetry_otlp::new_exporter()
                    .http()
                    .with_endpoint("https://otel.highlight.io:4318"),
            );
        Self::install_pipelines(tracing)
    }

    /// Initialize Highlight.
    pub fn init(config: HighlightConfig) -> Result<Highlight, HighlightError> {
        if config.project_id == String::default() {
            return Err(HighlightError::Config(
                "You must specify a project_id in your HighlightConfig".to_string(),
            ));
        }

        global::set_text_map_propagator(TraceContextPropagator::new());
        let tracer = Self::make_install_pipelines(&config)?;

        let h = Highlight(Arc::new(HighlightInner {
            config,
            tracer,
        }));

        Ok(h)
    }
    

    /// Capture an error with session info
    ///
    /// Like Highlight::capture_error, but also lets you provide your session_id and request_id
    pub fn capture_error_with_session(
        &self,
        err: &dyn Error,
        session_id: Option<String>,
        request_id: Option<String>,
    ) {
        self.0.tracer.in_span("highlight-ctx", |cx| {
            cx.span().record_error(err);

            if let Some(session_id) = session_id {
                cx.span()
                    .set_attribute(KeyValue::new("highlight.session_id", session_id));
            }

            if let Some(request_id) = request_id {
                cx.span()
                    .set_attribute(KeyValue::new("highlight.trace_id", request_id));
            }

            cx.span().set_status(Status::error(format!("{:?}", err)));
        });
    }

    /// Capture an error
    ///
    /// Explicitly captures any type with trait Error and sends it to Highlight.
    pub fn capture_error(&self, err: &str) {
        let e = std::io::Error::new(
		std::io::ErrorKind::Other,
            err
	    );
        self.capture_error_with_session(&e, None, None);
    }

    /// Create a span
    ///
    /// Creates a span for tracing. You can end it with span.end() by importing highlightio::SpanTrait.
    pub fn span(&self, name: impl Into<Cow<'static, str>>) -> Span {
        self.0.tracer.start(name)
    }

    /// Returns the project ID.
    pub fn project_id(&self) -> String {
        self.0.config.project_id.clone()
    }

    /// Shuts down the Highlight tracer.
    /// This allows for the traces to flush while the runtime is still around.
    /// If this method is not called, traces that happened right before your app exits will not be transmitted to Highlight.
    pub fn shutdown(&self) {
        global::shutdown_tracer_provider();
    }
}

