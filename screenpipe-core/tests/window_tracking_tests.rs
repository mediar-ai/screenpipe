#[cfg(test)]
mod tests {
    use screenpipe_core::get_active_window;

    use super::*;

    #[test]
    fn test_get_active_window() {
        let result = get_active_window();
        assert!(
            result.is_ok(),
            "Failed to get active window: {:?}",
            result.err()
        );

        let window_info = result.unwrap();
        assert!(
            !window_info.name.is_empty() || !window_info.owner_name.is_empty(),
            "Window name and owner name should not both be empty"
        );

        println!("Active window info: {:?}", window_info);

        // let all_window_info = print_all_window_info();
        // println!("All window info: {:?}", all_window_info);
    }
}
