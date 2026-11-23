import { useEffect, useRef, useState } from "react";

export type RadioSection = "home" | "settings";

type RadioNavigation = {
  section: RadioSection;
  chatOpen: boolean;
  aboutOpen: boolean;
};

const home: RadioNavigation = { section: "home", chatOpen: false, aboutOpen: false };

function readNavigation(): RadioNavigation {
  const saved = window.history.state?.redioNavigation;
  return {
    section: saved?.section === "settings" ? "settings" : "home",
    chatOpen: saved?.chatOpen === true,
    aboutOpen: window.location.hash === "#about"
  };
}

export function useRadioNavigation() {
  const [current, setCurrent] = useState(readNavigation);
  const aboutTrigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function restore() {
      setCurrent(readNavigation());
    }
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useEffect(() => {
    if (!current.aboutOpen && document.activeElement === document.body) {
      aboutTrigger.current?.focus({ preventScroll: true });
    }
  }, [current.aboutOpen]);

  function navigate(next: RadioNavigation, replace = false) {
    if (next.aboutOpen === current.aboutOpen && next.chatOpen === current.chatOpen && next.section === current.section) {
      return;
    }

    // About opens a detail page. Its preceding history entry retains the tab and chat.
    const push = !replace && next.aboutOpen !== current.aboutOpen;
    const state = { ...window.history.state, redioNavigation: next };
    const url = new URL(window.location.href);
    if (next.aboutOpen) url.hash = "about";
    else if (url.hash === "#about") url.hash = "";
    if (push) window.history.pushState(state, "", url);
    else window.history.replaceState(state, "", url);
    setCurrent(next);
  }

  return {
    ...current,
    showSection: (section: RadioSection) => navigate({ ...home, section }),
    showChat: () => navigate({ ...current, chatOpen: true, aboutOpen: false }),
    closeChat: () => navigate({ ...current, chatOpen: false }),
    showAbout() {
      if (current.aboutOpen) return;
      aboutTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      navigate({ ...current, aboutOpen: true });
    },
    reset: () => navigate(home, true)
  };
}
