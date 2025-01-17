#[cfg(target_os = "windows")]
use core::time::Duration;

#[cfg(target_os = "windows")]
use std::io::Write as _;

#[cfg(target_os = "windows")]
use std::{env, fs, path::Path};

#[cfg(target_os = "windows")]
use std::net::TcpStream;

#[cfg(target_os = "windows")]
use std::path::PathBuf;

#[cfg(target_os = "windows")]
use anyhow::Context as _;

#[cfg(target_os = "windows")]
use connector::Credentials;

#[cfg(target_os = "windows")]
use ironrdp::connector;

#[cfg(target_os = "windows")]
use ironrdp::connector::ConnectionResult;

#[cfg(target_os = "windows")]
use ironrdp::pdu::{gcc::KeyboardType, rdp::capability_sets::MajorPlatformType};

#[cfg(target_os = "windows")]
use ironrdp::session::{ActiveStage, ActiveStageOutput, image::DecodedImage};

#[cfg(target_os = "windows")]
use ironrdp_pdu::rdp::client_info::PerformanceFlags;

#[cfg(target_os = "windows")]
use sspi::network_client::reqwest_network_client::ReqwestNetworkClient;

#[cfg(target_os = "windows")]
use tokio_rustls::rustls;

fn main() {
    #[cfg(target_os = "windows")]
    {
        execute();
    }
}

#[cfg(target_os = "windows")]
fn execute() {
    let host = env::var("RDP_SERVER_URL").unwrap();
    let port = env::var("RDP_SERVER_PORT").ok()
        .and_then(|port| port.parse::<u16>().ok())
        .unwrap_or(3389);
    let username = env::var("RDP_SERVER_USERNAME").unwrap();
    let password = env::var("RDP_SERVER_PASSWORD").unwrap();

    let screenshots_dir = Path::new("screenshots");
    if !screenshots_dir.exists() {
        println!("creating screenshots directory...");
        fs::create_dir_all(screenshots_dir).unwrap();
    }

    let _ = run(host, port, username, password, PathBuf::from("screenshots/screenshot.jpg"), None);
}

#[cfg(target_os = "windows")]
fn run(
    server_name: String,
    port: u16,
    username: String,
    password: String,
    output: PathBuf,
    domain: Option<String>,
) -> anyhow::Result<()> {
    let config = build_config(username, password, domain);

    let (connection_result, framed) = connect(config, server_name, port).context("connect")?;

    let mut image = DecodedImage::new(
        ironrdp_graphics::image_processing::PixelFormat::RgbA32,
        connection_result.desktop_size.width,
        connection_result.desktop_size.height,
    );

    active_stage(connection_result, framed, &mut image).context("active stage")?;

    let img: image::ImageBuffer<image::Rgba<u8>, _> =
        image::ImageBuffer::from_raw(u32::from(image.width()), u32::from(image.height()), image.data())
            .context("invalid image")?;

    img.save(output).context("save image to disk")?;

    Ok(())
}

#[cfg(target_os = "windows")]
fn build_config(username: String, password: String, domain: Option<String>) -> connector::Config {
    connector::Config {
        credentials: Credentials::UsernamePassword { username, password },
        domain,
        enable_tls: false,
        enable_credssp: true,
        keyboard_type: KeyboardType::IbmEnhanced,
        keyboard_subtype: 0,
        keyboard_layout: 0,
        keyboard_functional_keys_count: 12,
        ime_file_name: String::new(),
        dig_product_id: String::new(),
        desktop_size: connector::DesktopSize {
            width: 1920,
            height: 1080,
        },
        bitmap: None,
        client_build: 0,
        client_name: "screenpipe-screenshot".to_owned(),
        client_dir: "C:\\Windows\\System32\\mstscax.dll".to_owned(),

        platform: MajorPlatformType::WINDOWS,

        no_server_pointer: true,
        request_data: None,
        autologon: false,
        pointer_software_rendering: true,
        performance_flags: PerformanceFlags::default(),
        desktop_scale_factor: 0,
    }
}

#[cfg(target_os = "windows")]
type UpgradedFramed = ironrdp_blocking::Framed<rustls::StreamOwned<rustls::ClientConnection, TcpStream>>;

#[cfg(target_os = "windows")]
fn connect(
    config: connector::Config,
    server_name: String,
    port: u16,
) -> anyhow::Result<(ConnectionResult, UpgradedFramed)> {
    let server_addr = lookup_addr(&server_name, port).context("lookup addr")?;

    let tcp_stream = TcpStream::connect(server_addr).context("TCP connect")?;

    tcp_stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .expect("set_read_timeout call failed");

    let mut framed = ironrdp_blocking::Framed::new(tcp_stream);

    let mut connector = connector::ClientConnector::new(config).with_server_addr(server_addr);

    let should_upgrade = ironrdp_blocking::connect_begin(&mut framed, &mut connector).context("begin connection")?;

    let initial_stream = framed.into_inner_no_leftover();

    let (upgraded_stream, server_public_key) =
        tls_upgrade(initial_stream, server_name.clone()).context("TLS upgrade")?;

    let upgraded = ironrdp_blocking::mark_as_upgraded(should_upgrade, &mut connector);

    let mut upgraded_framed = ironrdp_blocking::Framed::new(upgraded_stream);

    let mut network_client = ReqwestNetworkClient;
    let connection_result = ironrdp_blocking::connect_finalize(
        upgraded,
        &mut upgraded_framed,
        connector,
        server_name.into(),
        server_public_key,
        &mut network_client,
        None,
    )
    .context("finalize connection")?;

    Ok((connection_result, upgraded_framed))
}

#[cfg(target_os = "windows")]
fn active_stage(
    connection_result: ConnectionResult,
    mut framed: UpgradedFramed,
    image: &mut DecodedImage,
) -> anyhow::Result<()> {
    let mut active_stage = ActiveStage::new(connection_result);

    'outer: loop {
        let (action, payload) = match framed.read_pdu() {
            Ok((action, payload)) => (action, payload),
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => break 'outer,
            Err(e) => return Err(anyhow::Error::new(e).context("read frame")),
        };

        let outputs = active_stage.process(image, action, &payload)?;

        for out in outputs {
            match out {
                ActiveStageOutput::ResponseFrame(frame) => framed.write_all(&frame).context("write response")?,
                ActiveStageOutput::Terminate(_) => break 'outer,
                _ => {}
            }
        }
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn lookup_addr(hostname: &str, port: u16) -> anyhow::Result<std::net::SocketAddr> {
    use std::net::ToSocketAddrs as _;
    let addr = (hostname, port).to_socket_addrs()?.next().unwrap();
    Ok(addr)
}

#[cfg(target_os = "windows")]
fn tls_upgrade(
    stream: TcpStream,
    server_name: String,
) -> anyhow::Result<(rustls::StreamOwned<rustls::ClientConnection, TcpStream>, Vec<u8>)> {
    rustls::crypto::ring::default_provider().install_default().expect("Failed to install rustls crypto provider");
    let mut config = rustls::client::ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(std::sync::Arc::new(danger::NoCertificateVerification))
        .with_no_client_auth();

    // This adds support for the SSLKEYLOGFILE env variable (https://wiki.wireshark.org/TLS#using-the-pre-master-secret)
    config.key_log = std::sync::Arc::new(rustls::KeyLogFile::new());

    config.resumption = rustls::client::Resumption::disabled();

    let config = std::sync::Arc::new(config);

    let server_name = server_name.try_into().unwrap();

    let client = rustls::ClientConnection::new(config, server_name)?;

    let mut tls_stream = rustls::StreamOwned::new(client, stream);

    tls_stream.flush()?;

    let cert = tls_stream
        .conn
        .peer_certificates()
        .and_then(|certificates| certificates.first())
        .context("peer certificate is missing")?;

    let server_public_key = extract_tls_server_public_key(cert)?;

    Ok((tls_stream, server_public_key))
}

#[cfg(target_os = "windows")]
fn extract_tls_server_public_key(cert: &[u8]) -> anyhow::Result<Vec<u8>> {
    use x509_cert::der::Decode as _;

    let cert = x509_cert::Certificate::from_der(cert)?;

    let server_public_key = cert
        .tbs_certificate
        .subject_public_key_info
        .subject_public_key
        .as_bytes()
        .context("subject public key BIT STRING is not aligned")?
        .to_owned();

    Ok(server_public_key)
}

#[cfg(target_os = "windows")]
mod danger {
    use tokio_rustls::rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
    use tokio_rustls::rustls::{pki_types, DigitallySignedStruct, Error, SignatureScheme};

    #[derive(Debug)]
    pub(super) struct NoCertificateVerification;

    impl ServerCertVerifier for NoCertificateVerification {
        fn verify_server_cert(
            &self,
            _: &pki_types::CertificateDer<'_>,
            _: &[pki_types::CertificateDer<'_>],
            _: &pki_types::ServerName<'_>,
            _: &[u8],
            _: pki_types::UnixTime,
        ) -> Result<ServerCertVerified, Error> {
            Ok(ServerCertVerified::assertion())
        }

        fn verify_tls12_signature(
            &self,
            _: &[u8],
            _: &pki_types::CertificateDer<'_>,
            _: &DigitallySignedStruct,
        ) -> Result<HandshakeSignatureValid, Error> {
            Ok(HandshakeSignatureValid::assertion())
        }

        fn verify_tls13_signature(
            &self,
            _: &[u8],
            _: &pki_types::CertificateDer<'_>,
            _: &DigitallySignedStruct,
        ) -> Result<HandshakeSignatureValid, Error> {
            Ok(HandshakeSignatureValid::assertion())
        }

        fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
            vec![
                SignatureScheme::RSA_PKCS1_SHA1,
                SignatureScheme::ECDSA_SHA1_Legacy,
                SignatureScheme::RSA_PKCS1_SHA256,
                SignatureScheme::ECDSA_NISTP256_SHA256,
                SignatureScheme::RSA_PKCS1_SHA384,
                SignatureScheme::ECDSA_NISTP384_SHA384,
                SignatureScheme::RSA_PKCS1_SHA512,
                SignatureScheme::ECDSA_NISTP521_SHA512,
                SignatureScheme::RSA_PSS_SHA256,
                SignatureScheme::RSA_PSS_SHA384,
                SignatureScheme::RSA_PSS_SHA512,
                SignatureScheme::ED25519,
                SignatureScheme::ED448,
            ]
        }
    }
}