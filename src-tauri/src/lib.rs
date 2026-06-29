use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let menu = build_menu(app.handle())?;
            app.set_menu(menu)?;
            let handle = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                let event_name = match event.id().as_ref() {
                    "new"           => "menu-new",
                    "open"          => "menu-open",
                    "save"          => "menu-save",
                    "save-as"       => "menu-save-as",
                    "export-png"    => "menu-export-png",
                    "quit"          => "menu-quit",
                    "check-updates" => "menu-check-updates",
                    _               => return,
                };
                handle.emit(event_name, ()).ok();
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let new_item     = MenuItem::with_id(app, "new",        "New",           true, Some("CmdOrCtrl+N"))?;
    let open_item    = MenuItem::with_id(app, "open",       "Open...",       true, Some("CmdOrCtrl+O"))?;
    let sep1         = PredefinedMenuItem::separator(app)?;
    let save_item    = MenuItem::with_id(app, "save",       "Save",          true, Some("CmdOrCtrl+S"))?;
    let save_as_item = MenuItem::with_id(app, "save-as",    "Save As...",    true, Some("CmdOrCtrl+Shift+S"))?;
    let sep2         = PredefinedMenuItem::separator(app)?;
    let export_item  = MenuItem::with_id(app, "export-png", "Export PNG...", true, Some("CmdOrCtrl+E"))?;
    let sep3         = PredefinedMenuItem::separator(app)?;
    let quit_item    = MenuItem::with_id(app, "quit",       "Quit",          true, Some("CmdOrCtrl+Q"))?;

    let file_menu = Submenu::with_items(app, "File", true, &[
        &new_item,
        &open_item,
        &sep1,
        &save_item,
        &save_as_item,
        &sep2,
        &export_item,
        &sep3,
        &quit_item,
    ])?;

    let check_updates_item = MenuItem::with_id(app, "check-updates", "Check for Updates...", true, None::<&str>)?;
    let help_menu = Submenu::with_items(app, "Help", true, &[
        &check_updates_item,
    ])?;

    Menu::with_items(app, &[&file_menu, &help_menu])
}
