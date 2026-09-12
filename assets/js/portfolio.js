(() => {
  document.querySelectorAll('[data-feedback-carousel]').forEach((carousel) => {
    const slides = [...carousel.querySelectorAll('[data-feedback-slide]')];
    const controls = carousel.querySelector('.feedback-controls');
    let current = 0;
    let timer;
    let transitioning = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let paused = reducedMotion.matches;
    const pauseButton = carousel.querySelector('[data-feedback-pause]');
    const schedule = () => {
      clearTimeout(timer);
      if (slides.length > 1 && !paused && !document.hidden && !carousel.matches(':hover') && !carousel.contains(document.activeElement)) {
        timer = setTimeout(() => change(1), 6000);
      }
    };
    const render = () => {
      slides.forEach((slide, index) => { slide.hidden = index !== current; });
      carousel.querySelector('[data-feedback-count]').textContent = `${current + 1} of ${slides.length}`;
    };
    const change = async (direction) => {
      if (transitioning) return;
      transitioning = true;
      clearTimeout(timer);
      const fade = async (slide, from, to) => {
        if (!reducedMotion.matches && slide.animate) {
          await slide.animate([{ opacity: from }, { opacity: to }], { duration: 250, easing: 'ease-in-out' }).finished;
        }
      };
      await fade(slides[current], 1, 0);
      current = (current + direction + slides.length) % slides.length;
      render();
      await fade(slides[current], 0, 1);
      transitioning = false;
      schedule();
    };
    if (slides.length > 1) {
      controls.hidden = false;
      carousel.querySelector('[data-feedback-prev]').addEventListener('click', () => {
        change(-1);
      });
      carousel.querySelector('[data-feedback-next]').addEventListener('click', () => {
        change(1);
      });
      const updatePause = () => {
        pauseButton.textContent = paused ? 'Play' : 'Pause';
        pauseButton.setAttribute('aria-label', paused ? 'Start automatic feedback rotation' : 'Pause automatic feedback rotation');
        carousel.querySelector('[data-feedback-count]').setAttribute('aria-live', paused ? 'polite' : 'off');
        schedule();
      };
      pauseButton.addEventListener('click', () => { paused = !paused; updatePause(); });
      reducedMotion.addEventListener('change', () => { paused = reducedMotion.matches; updatePause(); });
      carousel.addEventListener('mouseenter', () => clearTimeout(timer));
      carousel.addEventListener('mouseleave', schedule);
      carousel.addEventListener('focusin', () => clearTimeout(timer));
      carousel.addEventListener('focusout', () => setTimeout(schedule, 0));
      document.addEventListener('visibilitychange', schedule);
      updatePause();
    }
    render();
  });
  const homepage = document.querySelector(".portfolio-site");
  const navbarContainer = document.querySelector("#navbar > .container");

  if (homepage && navbarContainer && !navbarContainer.querySelector(".navbar-brand")) {
    const homeLink = navbarContainer.querySelector(".nav-item.active > .nav-link");
    const brand = document.createElement("a");

    brand.className = "navbar-brand title font-weight-lighter";
    brand.href = homeLink?.href || "/";
    brand.textContent = "Harsh Verma";
    brand.setAttribute("aria-label", "Harsh Verma home");
    navbarContainer.prepend(brand);
  }

  const projectNavLink = document.querySelector('.navbar .nav-link[href$="#projects"]');
  const projectTarget = document.getElementById("projects");

  if (projectNavLink && projectTarget) {
    projectNavLink.addEventListener("click", (event) => {
      event.preventDefault();

      const mobileMenu = document.getElementById("navbarNav");
      const mobileToggle = document.querySelector('[data-nav-toggle="navbarNav"]');

      mobileMenu?.classList.remove("show");
      mobileToggle?.classList.add("collapsed");
      mobileToggle?.setAttribute("aria-expanded", "false");

      window.history.pushState(null, "", projectNavLink.href);
      projectTarget.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const dialogTriggers = document.querySelectorAll("[data-dialog-id]");

  dialogTriggers.forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      const dialog = document.getElementById(trigger.dataset.dialogId);

      if (!dialog || typeof dialog.showModal !== "function") {
        if (trigger.dataset.articleUrl) window.location.href = trigger.dataset.articleUrl;
        return;
      }

      event.preventDefault();
      dialog.showModal();
      document.body.classList.add("portfolio-dialog-open");
    });
  });

  document.querySelectorAll(".portfolio-dialog").forEach((dialog) => {
    dialog.querySelectorAll("[data-dialog-close]").forEach((button) => {
      button.addEventListener("click", () => dialog.close());
    });

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });

    dialog.addEventListener("close", () => {
      document.body.classList.remove("portfolio-dialog-open");
    });
  });

  const pageJumpForm = document.querySelector(".hub-page-jump");

  pageJumpForm?.addEventListener("submit", (event) => {
    event.preventDefault();

    const pageInput = pageJumpForm.querySelector('input[name="page"]');
    const requestedPage = Number.parseInt(pageInput?.value, 10);
    const lastPage = Number.parseInt(pageInput?.max, 10);

    if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > lastPage) {
      pageInput?.reportValidity();
      return;
    }

    window.location.href = requestedPage === 1 ? pageJumpForm.dataset.firstPage : `${pageJumpForm.dataset.pagePrefix}${requestedPage}/`;
  });
})();
