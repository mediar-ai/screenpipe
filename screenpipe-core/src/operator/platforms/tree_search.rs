/// TLDR: default TreeWalker does not traverse windows, so we need to traverse windows manually
use accessibility::{AXAttribute, AXUIElement, AXUIElementAttributes, Error};
use core_foundation::array::CFArray;
use core_foundation::base::TCFType;
use std::{
    cell::{Cell, RefCell},
    collections::HashSet,
    hash::{Hash, Hasher},
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
    visited: RefCell<HashSet<AXUIElementWrapper>>,
    cycle_count: RefCell<usize>,
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
            visited: RefCell::new(HashSet::new()),
            cycle_count: RefCell::new(0),
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
        // Create wrapper for the element
        let element_wrapper = AXUIElementWrapper {
            element: root.clone(),
        };

        // Check if already visited
        if self.visited.borrow().contains(&element_wrapper) {
            // Increment cycle counter
            let mut count = self.cycle_count.borrow_mut();
            *count += 1;

            return TreeWalkerFlow::SkipSubtree;
        }

        // Mark as visited
        self.visited.borrow_mut().insert(element_wrapper);

        let mut flow = visitor.enter_element(root);

        // debug!(target: "operator", "Walking element: {:?}", root.role());

        if flow == TreeWalkerFlow::Continue {
            // First try to get windows (if this is an application element)
            let windows_result = root.windows();
            if let Ok(windows) = &windows_result {
                for window in windows.iter() {
                    // debug!(target: "operator", "Walking window: {:?}", window.title());
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
                    // debug!(target: "operator", "Walking main window: {:?}", main_window.title());
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

    pub fn get_cycle_count(&self) -> usize {
        *self.cycle_count.borrow()
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
    max_results: Option<usize>,
    max_depth: Option<usize>,
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
            max_results: None,
            max_depth: None,
        }
    }

    pub fn with_limits(mut self, max_results: Option<usize>, max_depth: Option<usize>) -> Self {
        self.max_results = max_results;
        self.max_depth = max_depth;
        self
    }

    pub fn find_all(&self) -> Vec<AXUIElement> {
        let walker = TreeWalkerWithWindows::new();
        walker.walk(&self.root, self);

        // After traversal is done, log how many cycles were detected
        let cycles = walker.get_cycle_count();
        if cycles > 0 {
            debug!(target: "operator", "UI traversal complete - detected {} cycles in the accessibility tree", cycles);
        }

        self.matches.borrow().clone()
    }

    pub fn with_max_results(self, max: Option<usize>) -> Self {
        Self {
            max_results: max,
            ..self
        }
    }

    pub fn with_max_depth(self, max: Option<usize>) -> Self {
        Self {
            max_depth: max,
            ..self
        }
    }
}

impl TreeVisitor for ElementsCollectorWithWindows {
    fn enter_element(&self, element: &AXUIElement) -> TreeWalkerFlow {
        self.depth.set(self.depth.get() + 1);

        if let Some(max_depth) = self.max_depth {
            if self.depth.get() > max_depth {
                return TreeWalkerFlow::SkipSubtree;
            }
        } else if self.depth.get() > MAX_DEPTH {
            return TreeWalkerFlow::SkipSubtree;
        }

        if (self.predicate)(element) {
            self.matches.borrow_mut().push(element.clone());

            if let Some(max_results) = self.max_results {
                if self.matches.borrow().len() >= max_results {
                    debug!(target: "operator", "Reached max_results limit of {}", max_results);
                    return TreeWalkerFlow::Exit;
                }
            }
        }

        TreeWalkerFlow::Continue
    }

    fn exit_element(&self, _element: &AXUIElement) {
        self.depth.set(self.depth.get() - 1)
    }
}

// Add a wrapper struct similar to Swift
struct AXUIElementWrapper {
    element: AXUIElement,
}

impl PartialEq for AXUIElementWrapper {
    fn eq(&self, other: &Self) -> bool {
        // Use Core Foundation's CFEqual for proper element comparison
        unsafe {
            let self_ref = self.element.as_concrete_TypeRef();
            let other_ref = other.element.as_concrete_TypeRef();

            // CFEqual returns a Boolean (u8), convert to bool
            core_foundation::base::CFEqual(self_ref as _, other_ref as _) != 0
        }
    }
}

impl Eq for AXUIElementWrapper {}

impl Hash for AXUIElementWrapper {
    fn hash<H: Hasher>(&self, state: &mut H) {
        // Use Core Foundation's CFHash for consistent hashing
        unsafe {
            let element_ref = self.element.as_concrete_TypeRef();
            let hash_value = core_foundation::base::CFHash(element_ref as _);
            state.write_u64(hash_value as u64);
        }
    }
}
