(() => {
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

      if (!dialog || typeof dialog.showModal !== "function") return;

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
})();
