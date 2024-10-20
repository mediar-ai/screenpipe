use rand::Rng;
use std::net::{TcpListener, UdpSocket};

pub fn pick_unused_port() -> Option<u16> {
    let mut rng = rand::thread_rng();

    // Try random ports first
    for _ in 0..10 {
        let port = rng.gen_range(15000..65535);
        if is_port_available(port) {
            return Some(port);
        }
    }

    // If random attempts fail, try to let the OS choose
    for _ in 0..5 {
        if let Some(port) = get_available_port() {
            if is_port_available(port) {
                return Some(port);
            }
        }
    }

    None
}

fn is_port_available(port: u16) -> bool {
    is_tcp_port_available(port) && is_udp_port_available(port)
}

fn is_tcp_port_available(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn is_udp_port_available(port: u16) -> bool {
    UdpSocket::bind(("127.0.0.1", port)).is_ok()
}

fn get_available_port() -> Option<u16> {
    TcpListener::bind(("127.0.0.1", 0))
        .ok()
        .and_then(|listener| listener.local_addr().ok())
        .map(|addr| addr.port())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pick_unused_port() {
        let port = pick_unused_port();
        assert!(port.is_some());
        let port = port.unwrap();
        assert!(port >= 15000 && port < 65535);
        assert!(is_port_available(port));
    }
}
