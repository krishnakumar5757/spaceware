import { useEffect, useRef } from "react";

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
) {
  const ref = useRef<T>(null);
  const {
    threshold = 0.08,
    rootMargin = "0px 0px -20px 0px",
    triggerOnce = true,
  } = options;

  useEffect(() => {
    const el = ref.current;
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

    // Identify scroll container (.page-viewport) if nested, fallback to null (document viewport)
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

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin, triggerOnce]);

  return ref;
}

/**
 * Hook to observe all .reveal-item and .stagger-container elements within a container.
 */
export function useScrollRevealContainer<T extends HTMLElement = HTMLDivElement>(
  options: ScrollRevealOptions = {}
) {
  const containerRef = useRef<T>(null);
  const {
    threshold = 0.08,
    rootMargin = "0px 0px -20px 0px",
    triggerOnce = true,
  } = options;

  useEffect(() => {
    const container = containerRef.current;
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

    const elements = container.querySelectorAll(".reveal-item, .stagger-container");
    if (elements.length === 0) return;

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

    elements.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin, triggerOnce]);

  return containerRef;
}
