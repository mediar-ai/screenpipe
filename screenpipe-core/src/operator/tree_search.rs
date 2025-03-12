/// TLDR: default TreeWalker does not traverse windows, so we need to traverse windows manually
use accessibility::{AXAttribute, AXUIElement, AXUIElementAttributes, Error};
use core_foundation::array::CFArray;
use std::{
    cell::{Cell, RefCell},
    thread,
    time::{Duration, Instant},
};
use tracing::debug;

pub trait TreeVisitor {
    fn enter_element(&self, element: &AXUIElement) -> TreeWalkerFlow;
    fn exit_element(&self, element: &AXUIElement);
}

pub struct TreeWalkerWithWindows {
    attr_children: AXAttribute<CFArray<AXUIElement>>,
}

#[derive(Copy, Clone, PartialEq, Eq)]
pub enum TreeWalkerFlow {
    Continue,
    SkipSubtree,
    Exit,
}

impl Default for TreeWalkerWithWindows {
    fn default() -> Self {
        Self {
            attr_children: AXAttribute::children(),
        }
    }
}

impl TreeWalkerWithWindows {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn walk(&self, root: &AXUIElement, visitor: &dyn TreeVisitor) {
        let _ = self.walk_one(root, visitor);
    }

    fn walk_one(&self, root: &AXUIElement, visitor: &dyn TreeVisitor) -> TreeWalkerFlow {
        let mut flow = visitor.enter_element(root);

        debug!(target: "operator", "Walking element: {:?}", root.role());

        if flow == TreeWalkerFlow::Continue {
            // First try to get windows (if this is an application element)
            let windows_result = root.windows();
            if let Ok(windows) = &windows_result {
                for window in windows.iter() {
                    debug!(target: "operator", "Walking window: {:?}", window.title());
                    let window_flow = self.walk_one(&window, visitor);
                    if window_flow == TreeWalkerFlow::Exit {
                        flow = window_flow;
                        break;
                    }
                }
            }

            // TODO avoid duplicate main window walking
            // Try main window
            if flow != TreeWalkerFlow::Exit {
                if let Ok(main_window) = root.main_window() {
                    debug!(target: "operator", "Walking main window: {:?}", main_window.title());
                    let window_flow = self.walk_one(&main_window, visitor);
                    if window_flow == TreeWalkerFlow::Exit {
                        flow = window_flow;
                    }
                }
            }

            // If we haven't exited yet, continue with regular children
            if flow == TreeWalkerFlow::Continue {
                if let Ok(children) = root.attribute(&self.attr_children) {
                    for child in children.into_iter() {
                        let child_flow = self.walk_one(&child, visitor);

                        if child_flow == TreeWalkerFlow::Exit {
                            flow = child_flow;
                            break;
                        }
                    }
                }
            }
        }

        visitor.exit_element(root);
        flow
    }
}

pub struct ElementFinderWithWindows {
    root: AXUIElement,
    implicit_wait: Option<Duration>,
    predicate: Box<dyn Fn(&AXUIElement) -> bool>,
    depth: Cell<usize>,
    cached: RefCell<Option<AXUIElement>>,
}

impl ElementFinderWithWindows {
    pub fn new<F>(root: &AXUIElement, predicate: F, implicit_wait: Option<Duration>) -> Self
    where
        F: 'static + Fn(&AXUIElement) -> bool,
    {
        Self {
            root: root.clone(),
            predicate: Box::new(predicate),
            implicit_wait,
            depth: Cell::new(0),
            cached: RefCell::new(None),
        }
    }

    pub fn find(&self) -> Result<AXUIElement, Error> {
        if let Some(result) = &*self.cached.borrow() {
            return Ok(result.clone());
        }

        let mut deadline = Instant::now();
        let walker = TreeWalkerWithWindows::new();

        if let Some(implicit_wait) = &self.implicit_wait {
            deadline += *implicit_wait;
        }

        loop {
            if let Some(result) = &*self.cached.borrow() {
                return Ok(result.clone());
            }

            walker.walk(&self.root, self);
            let now = Instant::now();

            if now >= deadline {
                return Err(Error::NotFound);
            } else {
                let time_left = deadline.saturating_duration_since(now);
                thread::sleep(std::cmp::min(time_left, Duration::from_millis(250)));
            }
        }
    }
}

const MAX_DEPTH: usize = 100;

impl TreeVisitor for ElementFinderWithWindows {
    fn enter_element(&self, element: &AXUIElement) -> TreeWalkerFlow {
        self.depth.set(self.depth.get() + 1);

        if (self.predicate)(element) {
            self.cached.replace(Some(element.clone()));
            return TreeWalkerFlow::Exit;
        }

        if self.depth.get() > MAX_DEPTH {
            TreeWalkerFlow::SkipSubtree
        } else {
            TreeWalkerFlow::Continue
        }
    }

    fn exit_element(&self, _element: &AXUIElement) {
        self.depth.set(self.depth.get() - 1)
    }
}

pub struct ElementsCollectorWithWindows {
    root: AXUIElement,
    predicate: Box<dyn Fn(&AXUIElement) -> bool>,
    depth: Cell<usize>,
    matches: RefCell<Vec<AXUIElement>>,
}

impl ElementsCollectorWithWindows {
    pub fn new<F>(root: &AXUIElement, predicate: F) -> Self
    where
        F: 'static + Fn(&AXUIElement) -> bool,
    {
        Self {
            root: root.clone(),
            predicate: Box::new(predicate),
            depth: Cell::new(0),
            matches: RefCell::new(Vec::new()),
        }
    }

    pub fn find_all(&self) -> Vec<AXUIElement> {
        let walker = TreeWalkerWithWindows::new();
        walker.walk(&self.root, self);
        self.matches.borrow().clone()
    }
}

impl TreeVisitor for ElementsCollectorWithWindows {
    fn enter_element(&self, element: &AXUIElement) -> TreeWalkerFlow {
        self.depth.set(self.depth.get() + 1);

        if (self.predicate)(element) {
            self.matches.borrow_mut().push(element.clone());
        }

        if self.depth.get() > MAX_DEPTH {
            TreeWalkerFlow::SkipSubtree
        } else {
            TreeWalkerFlow::Continue
        }
    }

    fn exit_element(&self, _element: &AXUIElement) {
        self.depth.set(self.depth.get() - 1)
    }
}
