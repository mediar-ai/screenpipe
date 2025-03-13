use screenpipe_server::icons::get_app_icon;

#[tokio::test]
async fn test_get_app_icon() {
    let apps = vec![
        "firefox",
        "screenpipe",
        "safari",
    ];

    for app in apps {
        let result = get_app_icon(app, None).await;
        assert!(result.is_ok(), "failed to get app icon");
        let app_icon = result.unwrap();
        assert!(app_icon.is_some());
    }
}


#[tokio::test]
async fn test_get_app_icon_with_invalid_app_name() {
    let app_name = "NonExistentApp";
    let result = get_app_icon(app_name, None).await;
    assert!(result.is_ok());
    let app_icon = result.unwrap();
    assert!(app_icon.is_none());
}
