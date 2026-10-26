import { useEffect, useRef, useState, useCallback, DependencyList } from "react";

export interface ScrollRevealOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

/**
 * Hook to observe a single element and add 'is-revealed' class when scrolled into view.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: ScrollRevealOptions = {}
): React.RefObject<T> {
  const [targetNode, setTargetNode] = useState<T | null>(null);
  const ref = useRef<T | null>(null);

  const callbackRef = useCallback((node: T | null) => {
    ref.current = node;
    setTargetNode(node);
  }, []);

  useEffect(() => {
    if (ref.current && ref.current !== targetNode) {
      setTargetNode(ref.current);
    }
  });

  const {
    threshold = 0.08,
    rootMargin = "0px 0px -20px 0px",
    triggerOnce = true,
  } = options;

  useEffect(() => {
    const el = targetNode || ref.current;
    if (!el) return;

    // Respect prefers-reduced-motion
    if (
      typeof window === "undefined" ||
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      el.classList.add("is-revealed");
      return;
    }

    const scrollContainer = el.closest(".page-viewport");

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            if (triggerOnce) {
              observer.unobserve(entry.target);
            }
          } else if (!triggerOnce) {
            entry.target.classList.remove("is-revealed");
          }
        });
      },
      {
        root: scrollContainer || null,
        rootMargin,
        threshold,
      }
    );

    observer.observe(el);

    // Initial check for elements already in viewport
    const rafId = requestAnimationFrame(() => {
      if (typeof window !== "undefined") {
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight;
        if (rect.top < vh && rect.bottom > 0) {
          el.classList.add("is-revealed");
          if (triggerOnce) {
            observer.unobserve(el);
          }
        }
      }
    });

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [targetNode, threshold, rootMargin, triggerOnce]);

  const refObject = callbackRef as unknown as React.RefObject<T>;
  Object.defineProperty(refObject, "current", {
    get: () => ref.current,
    set: (val: T | null) => {
      ref.current = val;
      setTargetNode(val);
    },
    configurable: true,
  });

  return refObject;
}

/**
 * Hook to observe all .reveal-item and .stagger-container elements within a container.
 * Resilient to dynamic DOM changes, loading states, and async mount timing.
 */
export function useScrollRevealContainer<T extends HTMLElement = HTMLDivElement>(
  options: ScrollRevealOptions = {},
  deps: DependencyList = []
): React.RefObject<T> {
  const [containerNode, setContainerNode] = useState<T | null>(null);
  const containerRef = useRef<T | null>(null);

  const callbackRef = useCallback((node: T | null) => {
    containerRef.current = node;
    setContainerNode(node);
  }, []);

  // Sync if containerRef.current was set directly (e.g. traditional ref assignment)
  useEffect(() => {
    if (containerRef.current && containerRef.current !== containerNode) {
      setContainerNode(containerRef.current);
    }
  });

  const {
    threshold = 0.08,
    rootMargin = "0px 0px -20px 0px",
    triggerOnce = true,
  } = options;

  useEffect(() => {
    const container = containerNode || containerRef.current;
    if (!container) return;

    // Respect prefers-reduced-motion
    if (
      typeof window === "undefined" ||
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      container
        .querySelectorAll(".reveal-item, .stagger-container")
        .forEach((el) => el.classList.add("is-revealed"));
      return;
    }

    const scrollContainer = container.classList.contains("page-viewport")
      ? container
      : container.closest(".page-viewport");

    const observedSet = new WeakSet<Element>();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            if (triggerOnce) {
              observer.unobserve(entry.target);
            }
          } else if (!triggerOnce) {
            entry.target.classList.remove("is-revealed");
          }
        });
      },
      {
        root: scrollContainer || null,
        rootMargin,
        threshold,
      }
    );

    const observeMatchingElements = () => {
      const elements = container.querySelectorAll(
        ".reveal-item, .stagger-container"
      );
      elements.forEach((el) => {
        if (!observedSet.has(el)) {
          observedSet.add(el);
          observer.observe(el);
        }
      });
    };

    // Observe immediately available items
    observeMatchingElements();

    // Use MutationObserver so any dynamically or conditionally rendered items
    // (e.g., transition from loading state to dashboard metrics) are observed immediately
    let mutationObserver: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver(() => {
        observeMatchingElements();
      });

      mutationObserver.observe(container, {
        childList: true,
        subtree: true,
      });
    }

    // Safety fallback: if elements are already in the visible viewport, reveal them
    const rafId = requestAnimationFrame(() => {
      if (typeof window !== "undefined") {
        const elements = container.querySelectorAll(
          ".reveal-item:not(.is-revealed), .stagger-container:not(.is-revealed)"
        );
        const vh = window.innerHeight || document.documentElement.clientHeight;
        elements.forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.top < vh && rect.bottom > 0) {
            el.classList.add("is-revealed");
            if (triggerOnce) {
              observer.unobserve(el);
            }
          }
        });
      }
    });

    return () => {
      cancelAnimationFrame(rafId);
      if (mutationObserver) {
        mutationObserver.disconnect();
      }
      observer.disconnect();
    };
  }, [containerNode, threshold, rootMargin, triggerOnce, ...deps]);

  const refObject = callbackRef as unknown as React.RefObject<T>;
  Object.defineProperty(refObject, "current", {
    get: () => containerRef.current,
    set: (val: T | null) => {
      containerRef.current = val;
      setContainerNode(val);
    },
    configurable: true,
  });

  return refObject;
}
