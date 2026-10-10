// Hide the extra console on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod session;

use std::sync::{Arc, Mutex};

use iced::widget::{
    button, column, container, image, mouse_area, pick_list, row, scrollable, text, Space,
};
use iced::{window, Alignment, Element, Fill, Length, Point, Subscription, Task, Theme};

use session::{SessionClient, Snapshot};

fn main() -> iced::Result {
    iced::application(Desktop::boot, Desktop::update, Desktop::view)
        .title(Desktop::title)
        .theme(theme)
        .window_size((1280.0, 800.0))
        .centered()
        .exit_on_close_request(false)
        .subscription(Desktop::subscription)
        .run()
}

fn theme(_state: &Desktop) -> Theme {
    Theme::Dark
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MenuId {
    File,
    Edit,
    View,
    Object,
}

#[derive(Debug, Clone)]
enum Message {
    SessionReady(Result<Arc<Mutex<SessionClient>>, String>),
    Session(Result<Snapshot, String>),
    ToggleMenu(MenuId),
    New,
    Open,
    OpenPath(Option<String>),
    Save,
    SaveAs,
    SavePath(Option<String>),
    Undo,
    Redo,
    Delete,
    ZoomIn,
    ZoomOut,
    Zoom100,
    ZoomFit,
    ToggleLayers,
    CreateShape(&'static str),
    SelectPage(PageOption),
    SelectLayer(String),
    Cursor(Point),
    CanvasPress,
    QuitRequested,
    SaveAndQuit,
    DiscardAndQuit,
    CancelQuit,
}

#[derive(Debug, Clone, PartialEq)]
struct PageOption {
    id: String,
    name: String,
}

impl std::fmt::Display for PageOption {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.name)
    }
}

struct Desktop {
    session: Option<Arc<Mutex<SessionClient>>>,
    snapshot: Option<Snapshot>,
    png: Option<Vec<u8>>,
    error: Option<String>,
    busy: bool,
    open_menu: Option<MenuId>,
    show_layers: bool,
    cursor: Option<Point>,
    confirm_quit: bool,
    quit_after_save: bool,
}

impl Desktop {
    fn boot() -> (Self, Task<Message>) {
        (
            Self {
                session: None,
                snapshot: None,
                png: None,
                error: None,
                busy: true,
                open_menu: None,
                show_layers: true,
                cursor: None,
                confirm_quit: false,
                quit_after_save: false,
            },
            Task::perform(SessionClient::spawn(), Message::SessionReady),
        )
    }

    fn title(state: &Self) -> String {
        let name = state
            .snapshot
            .as_ref()
            .map(|snapshot| snapshot.title.as_str())
            .unwrap_or("OpenPencil");
        let dirty = state
            .snapshot
            .as_ref()
            .is_some_and(|snapshot| snapshot.dirty);
        if dirty {
            format!("{name}* — OpenPencil")
        } else {
            format!("{name} — OpenPencil")
        }
    }

    fn subscription(_state: &Self) -> Subscription<Message> {
        window::close_requests().map(|_id| Message::QuitRequested)
    }

    fn update(&mut self, message: Message) -> Task<Message> {
        match message {
            Message::SessionReady(result) => {
                self.busy = false;
                match result {
                    Ok(session) => {
                        self.session = Some(session);
                        self.busy = true;
                        self.call("new", serde_json::json!({}))
                    }
                    Err(error) => {
                        self.error = Some(error);
                        Task::none()
                    }
                }
            }
            Message::Session(result) => {
                self.busy = false;
                match result {
                    Ok(snapshot) => {
                        self.png = snapshot.png.clone();
                        self.error = snapshot.preview_error.clone();
                        let quit = self.quit_after_save && !snapshot.dirty;
                        self.snapshot = Some(snapshot);
                        if quit {
                            self.quit_after_save = false;
                            iced::exit()
                        } else {
                            Task::none()
                        }
                    }
                    Err(error) => {
                        self.quit_after_save = false;
                        self.error = Some(error);
                        Task::none()
                    }
                }
            }
            Message::ToggleMenu(menu) => {
                self.open_menu = if self.open_menu == Some(menu) {
                    None
                } else {
                    Some(menu)
                };
                Task::none()
            }
            Message::New => {
                self.open_menu = None;
                self.confirm_quit = false;
                self.request("new", serde_json::json!({}))
            }
            Message::Open => {
                self.open_menu = None;
                Task::perform(pick_open_path(), Message::OpenPath)
            }
            Message::OpenPath(path) => match path {
                Some(path) => self.request("open", serde_json::json!({ "path": path })),
                None => Task::none(),
            },
            Message::Save => {
                self.open_menu = None;
                if self
                    .snapshot
                    .as_ref()
                    .and_then(|snapshot| snapshot.path.as_ref())
                    .is_some_and(|path| path.to_ascii_lowercase().ends_with(".fig"))
                {
                    self.request("save", serde_json::json!({}))
                } else {
                    self.update(Message::SaveAs)
                }
            }
            Message::SaveAs => {
                self.open_menu = None;
                let suggested = self
                    .snapshot
                    .as_ref()
                    .map(|snapshot| format!("{}.fig", snapshot.title))
                    .unwrap_or_else(|| "Untitled.fig".to_string());
                Task::perform(pick_save_path(suggested), Message::SavePath)
            }
            Message::SavePath(path) => match path {
                Some(path) => self.request("saveAs", serde_json::json!({ "path": path })),
                None => {
                    self.quit_after_save = false;
                    Task::none()
                }
            },
            Message::Undo => {
                self.open_menu = None;
                self.request("undo", serde_json::json!({}))
            }
            Message::Redo => {
                self.open_menu = None;
                self.request("redo", serde_json::json!({}))
            }
            Message::Delete => {
                self.open_menu = None;
                self.request("deleteSelection", serde_json::json!({}))
            }
            Message::ZoomIn => self.adjust_zoom(1.25),
            Message::ZoomOut => self.adjust_zoom(0.8),
            Message::Zoom100 => {
                self.open_menu = None;
                self.request("setZoom", serde_json::json!({ "zoom": 1.0 }))
            }
            Message::ZoomFit => {
                self.open_menu = None;
                self.request("zoomFit", serde_json::json!({}))
            }
            Message::ToggleLayers => {
                self.show_layers = !self.show_layers;
                self.open_menu = None;
                Task::none()
            }
            Message::CreateShape(kind) => {
                self.open_menu = None;
                self.request("createShape", serde_json::json!({ "type": kind }))
            }
            Message::SelectPage(page) => {
                self.request("switchPage", serde_json::json!({ "pageId": page.id }))
            }
            Message::SelectLayer(id) => self.request("select", serde_json::json!({ "ids": [id] })),
            Message::Cursor(point) => {
                self.cursor = Some(point);
                Task::none()
            }
            Message::CanvasPress => {
                let Some(point) = self.cursor else {
                    return Task::none();
                };
                let Some(view) = self
                    .snapshot
                    .as_ref()
                    .and_then(|snapshot| snapshot.view.clone())
                else {
                    return Task::none();
                };
                if view.pixel_width == 0
                    || view.pixel_height == 0
                    || view.width <= 0.0
                    || view.height <= 0.0
                {
                    return Task::none();
                }
                let x =
                    view.min_x + (f64::from(point.x) / f64::from(view.pixel_width)) * view.width;
                let y =
                    view.min_y + (f64::from(point.y) / f64::from(view.pixel_height)) * view.height;
                self.request("hit", serde_json::json!({ "x": x, "y": y }))
            }
            Message::QuitRequested => {
                if self
                    .snapshot
                    .as_ref()
                    .is_some_and(|snapshot| snapshot.dirty)
                {
                    self.confirm_quit = true;
                    Task::none()
                } else {
                    iced::exit()
                }
            }
            Message::SaveAndQuit => {
                self.confirm_quit = false;
                self.quit_after_save = true;
                self.update(Message::Save)
            }
            Message::DiscardAndQuit => iced::exit(),
            Message::CancelQuit => {
                self.confirm_quit = false;
                self.quit_after_save = false;
                Task::none()
            }
        }
    }

    fn adjust_zoom(&mut self, factor: f64) -> Task<Message> {
        self.open_menu = None;
        let zoom = self
            .snapshot
            .as_ref()
            .map(|snapshot| snapshot.zoom)
            .unwrap_or(1.0);
        let next = (zoom * factor).clamp(0.1, 8.0);
        self.request("setZoom", serde_json::json!({ "zoom": next }))
    }

    fn request(&mut self, method: &'static str, extra: serde_json::Value) -> Task<Message> {
        if self.session.is_none() {
            self.error = Some(
                "The editor session is not running. Install Bun and start the desktop app from the repository."
                    .to_string(),
            );
            return Task::none();
        }
        self.busy = true;
        self.error = None;
        self.call(method, extra)
    }

    fn call(&self, method: &'static str, extra: serde_json::Value) -> Task<Message> {
        let Some(session) = self.session.clone() else {
            return Task::none();
        };
        Task::perform(
            async move {
                let method = method.to_string();
                tokio::task::spawn_blocking(move || {
                    let mut client = session.lock().unwrap_or_else(|poison| poison.into_inner());
                    client.call(&method, extra)
                })
                .await
                .unwrap_or_else(|error| Err(error.to_string()))
            },
            Message::Session,
        )
    }

    fn view(&self) -> Element<'_, Message> {
        let mut content = column![self.menu_bar(), self.menu_dropdown(), self.toolbar()]
            .spacing(8)
            .padding(8);

        if self.confirm_quit {
            content = content.push(self.quit_prompt());
        }
        if let Some(error) = &self.error {
            content = content.push(text(error).size(14));
        }

        content
            .push(self.workspace())
            .push(self.status_line())
            .into()
    }

    fn menu_bar(&self) -> Element<'_, Message> {
        row![
            menu_button("File", MenuId::File, self.open_menu),
            menu_button("Edit", MenuId::Edit, self.open_menu),
            menu_button("View", MenuId::View, self.open_menu),
            menu_button("Object", MenuId::Object, self.open_menu),
        ]
        .spacing(4)
        .into()
    }

    fn menu_dropdown(&self) -> Element<'_, Message> {
        let Some(menu) = self.open_menu else {
            return Space::new().height(0).into();
        };
        let can_undo = self
            .snapshot
            .as_ref()
            .is_some_and(|snapshot| snapshot.can_undo);
        let can_redo = self
            .snapshot
            .as_ref()
            .is_some_and(|snapshot| snapshot.can_redo);
        let items: Vec<Element<'_, Message>> = match menu {
            MenuId::File => vec![
                action("New", Message::New),
                action("Open…", Message::Open),
                action("Save", Message::Save),
                action("Save As…", Message::SaveAs),
                action("Quit", Message::QuitRequested),
            ],
            MenuId::Edit => vec![
                action_maybe("Undo", can_undo.then(|| Message::Undo)),
                action_maybe("Redo", can_redo.then(|| Message::Redo)),
                action("Delete", Message::Delete),
            ],
            MenuId::View => vec![
                action("Zoom In", Message::ZoomIn),
                action("Zoom Out", Message::ZoomOut),
                action("Zoom to 100%", Message::Zoom100),
                action("Zoom to Fit", Message::ZoomFit),
                action(
                    if self.show_layers {
                        "Hide Layers"
                    } else {
                        "Show Layers"
                    },
                    Message::ToggleLayers,
                ),
            ],
            MenuId::Object => vec![
                action("Rectangle", Message::CreateShape("RECTANGLE")),
                action("Ellipse", Message::CreateShape("ELLIPSE")),
                action("Frame", Message::CreateShape("FRAME")),
                action("Text", Message::CreateShape("TEXT")),
            ],
        };
        container(row(items).spacing(6).wrap())
            .padding(6)
            .style(container::rounded_box)
            .into()
    }

    fn toolbar(&self) -> Element<'_, Message> {
        let pages = self
            .snapshot
            .as_ref()
            .map(|snapshot| {
                snapshot
                    .pages
                    .iter()
                    .map(|page| PageOption {
                        id: page.id.clone(),
                        name: page.name.clone(),
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let selected = self.snapshot.as_ref().and_then(|snapshot| {
            pages
                .iter()
                .find(|page| page.id == snapshot.page_id)
                .cloned()
        });
        let zoom = self
            .snapshot
            .as_ref()
            .map(|snapshot| format!("{:.0}%", snapshot.zoom * 100.0))
            .unwrap_or_else(|| "—".to_string());
        row![
            text("Page"),
            pick_list(pages, selected, Message::SelectPage).width(220),
            Space::new().width(Fill),
            text(zoom),
            button("−").on_press(Message::ZoomOut),
            button("+").on_press(Message::ZoomIn),
        ]
        .spacing(8)
        .align_y(Alignment::Center)
        .into()
    }

    fn workspace(&self) -> Element<'_, Message> {
        let layers: Element<'_, Message> = if self.show_layers {
            container(scrollable(self.layer_list()).height(Fill))
                .width(280)
                .height(Fill)
                .padding(4)
                .into()
        } else {
            Space::new().width(0).into()
        };
        row![layers, self.canvas()].spacing(8).height(Fill).into()
    }

    fn layer_list(&self) -> Element<'_, Message> {
        let Some(snapshot) = &self.snapshot else {
            return text("No document").into();
        };
        if snapshot.nodes.is_empty() {
            return text("Empty page").into();
        }
        let mut list = column![].spacing(2);
        for node in &snapshot.nodes {
            let label = format!("{}{} ({})", "  ".repeat(node.depth), node.name, node.kind);
            let mut item =
                button(text(label).size(13)).on_press(Message::SelectLayer(node.id.clone()));
            if node.selected {
                item = item.style(button::primary);
            }
            list = list.push(item);
        }
        list.into()
    }

    fn canvas(&self) -> Element<'_, Message> {
        let Some(bytes) = &self.png else {
            return container(text(
                "The page has nothing to draw yet. Use Object to add a layer.",
            ))
            .width(Fill)
            .height(Fill)
            .center_x(Fill)
            .center_y(Fill)
            .into();
        };
        let handle = image::Handle::from_bytes(bytes.clone());
        let mut picture = image(handle).content_fit(iced::ContentFit::None);
        if let Some(view) = self
            .snapshot
            .as_ref()
            .and_then(|snapshot| snapshot.view.as_ref())
        {
            picture = picture
                .width(Length::Fixed(view.pixel_width as f32))
                .height(Length::Fixed(view.pixel_height as f32));
        }
        let surface = mouse_area(picture)
            .on_move(Message::Cursor)
            .on_press(Message::CanvasPress);
        scrollable(container(surface).padding(24))
            .width(Fill)
            .height(Fill)
            .into()
    }

    fn status_line(&self) -> Element<'_, Message> {
        let path = self
            .snapshot
            .as_ref()
            .and_then(|snapshot| snapshot.path.clone())
            .unwrap_or_else(|| "Unsaved document".to_string());
        let activity = if self.busy {
            "Working…"
        } else {
            self.snapshot
                .as_ref()
                .map(|snapshot| snapshot.status.as_str())
                .unwrap_or("Ready")
        };
        text(format!("{activity}  {path}")).size(13).into()
    }

    fn quit_prompt(&self) -> Element<'_, Message> {
        container(
            row![
                text("Save changes before quitting?"),
                button("Save").on_press(Message::SaveAndQuit),
                button("Don't Save").on_press(Message::DiscardAndQuit),
                button("Cancel").on_press(Message::CancelQuit),
            ]
            .spacing(8)
            .align_y(Alignment::Center),
        )
        .padding(8)
        .style(container::rounded_box)
        .into()
    }
}

fn menu_button(label: &'static str, id: MenuId, open: Option<MenuId>) -> Element<'static, Message> {
    let mut control = button(label).on_press(Message::ToggleMenu(id));
    if open == Some(id) {
        control = control.style(button::primary);
    }
    control.into()
}

fn action(label: &'static str, message: Message) -> Element<'static, Message> {
    action_maybe(label, Some(message))
}

fn action_maybe(label: &'static str, message: Option<Message>) -> Element<'static, Message> {
    let mut control = button(label);
    if let Some(message) = message {
        control = control.on_press(message);
    }
    control.into()
}

async fn pick_open_path() -> Option<String> {
    rfd::AsyncFileDialog::new()
        .set_title("Open")
        .add_filter("OpenPencil", &["fig", "pen"])
        .pick_file()
        .await
        .and_then(|file| file.path().to_str().map(str::to_string))
}

async fn pick_save_path(suggested: String) -> Option<String> {
    rfd::AsyncFileDialog::new()
        .set_title("Save As")
        .add_filter("Figma document", &["fig"])
        .set_file_name(suggested)
        .save_file()
        .await
        .map(|file| {
            let mut path = file.path().to_string_lossy().into_owned();
            if !path.to_ascii_lowercase().ends_with(".fig") {
                path.push_str(".fig");
            }
            path
        })
}
