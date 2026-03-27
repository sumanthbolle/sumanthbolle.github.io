;(function () {
  var DEFAULTS = {
    provider: "buttondown",
    buttondownUser: "REPLACE_WITH_YOUR_BUTTONDOWN_USERNAME",
  };

  function getConfig(overrides) {
    return Object.assign({}, DEFAULTS, window.SB_SUBSCRIBE_CONFIG || {}, overrides || {});
  }

  function isConfigured(config) {
    return (
      config.provider === "buttondown" &&
      !!config.buttondownUser &&
      config.buttondownUser !== "REPLACE_WITH_YOUR_BUTTONDOWN_USERNAME"
    );
  }

  function getActionUrl(config) {
    return "https://buttondown.email/api/emails/embed-subscribe/" + encodeURIComponent(config.buttondownUser || "");
  }

  function getLandingUrl(config) {
    return "https://buttondown.email/" + encodeURIComponent(config.buttondownUser || "");
  }

  function hasUsableAction(form) {
    var action = (form.getAttribute("action") || "").trim();
    return !!action && action.indexOf("REPLACE_WITH_YOUR_BUTTONDOWN_USERNAME") === -1;
  }

  function setStatus(el, type, message) {
    if (!el) return;
    el.className = "sb-subscribe-status show " + (type || "");
    el.textContent = message || "";
  }

  function bindForm(form, options) {
    if (!form || form.dataset.sbSubscribeBound === "1") return;
    var settings = options || {};
    var config = getConfig(settings.config || settings);
    var emailInput = settings.emailInput || form.querySelector('input[type="email"]');
    var statusEl =
      settings.statusEl ||
      form.querySelector("[data-subscribe-status]") ||
      form.parentElement.querySelector("[data-subscribe-status]");

    if (isConfigured(config)) form.action = getActionUrl(config);
    form.method = "post";
    form.noValidate = true;
    if (!form.target) form.target = "sbSubscribePopup";

    form.addEventListener("submit", function (event) {
      var email = emailInput && emailInput.value ? emailInput.value.trim() : "";
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        event.preventDefault();
        setStatus(statusEl, "error", "Please enter a valid email address.");
        return;
      }

      if (!isConfigured(config) && !hasUsableAction(form)) {
        event.preventDefault();
        setStatus(statusEl, "error", "Subscriptions are not live yet. Please check back shortly.");
        return;
      }

      var popupUrl = isConfigured(config) ? getLandingUrl(config) : form.action;
      if (popupUrl) window.open(popupUrl, "sbSubscribePopup", "scrollbars=yes,width=540,height=640");
      setStatus(statusEl, "success", "Almost done. Please complete confirmation in the popup window.");
    });

    form.dataset.sbSubscribeBound = "1";
  }

  function ensureStyles() {
    if (document.getElementById("sbSubscribeStyles")) return;
    var style = document.createElement("style");
    style.id = "sbSubscribeStyles";
    style.textContent =
      ".sb-subscribe-widget{max-width:1080px;margin:32px auto 12px;padding:0 22px}" +
      ".sb-subscribe-card{background:linear-gradient(135deg,#101321 0%,#1a1a2e 100%);color:#fff;border-radius:16px;padding:22px 20px;box-shadow:0 10px 30px rgba(0,0,0,.14)}" +
      ".sb-subscribe-kicker{font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#a6aec0;margin-bottom:8px}" +
      ".sb-subscribe-title{font-size:22px;font-weight:600;line-height:1.25;margin-bottom:8px}" +
      ".sb-subscribe-desc{font-size:14px;line-height:1.6;color:#c8cdd8;margin-bottom:14px}" +
      ".sb-subscribe-form{display:flex;gap:10px;align-items:center;flex-wrap:wrap}" +
      ".sb-subscribe-input{flex:1;min-width:220px;padding:11px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;font-size:14px;font-family:inherit;outline:none}" +
      ".sb-subscribe-input::placeholder{color:#b6bed0}" +
      ".sb-subscribe-btn{padding:11px 16px;border:none;border-radius:10px;background:#0066cc;color:#fff;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer}" +
      ".sb-subscribe-btn:hover{background:#0055aa}" +
      ".sb-subscribe-status{margin-top:10px;font-size:13px;display:none}" +
      ".sb-subscribe-status.show{display:block}" +
      ".sb-subscribe-status.success{color:#86efac}" +
      ".sb-subscribe-status.error{color:#fda4af}" +
      ".sb-subscribe-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.65);z-index:10050;padding:18px}" +
      ".sb-subscribe-modal.open{display:flex}" +
      ".sb-subscribe-modal-card{background:#fff;color:#1d1d1f;width:min(560px,100%);border-radius:16px;padding:24px;position:relative;box-shadow:0 16px 40px rgba(0,0,0,.35)}" +
      ".sb-subscribe-modal-close{position:absolute;top:10px;right:10px;width:34px;height:34px;border:1px solid rgba(0,0,0,.12);background:#fff;border-radius:999px;cursor:pointer;font-size:18px;line-height:1}" +
      ".sb-subscribe-modal-title{font-size:25px;font-weight:700;line-height:1.2;margin-bottom:8px}" +
      ".sb-subscribe-modal-desc{font-size:14px;line-height:1.65;color:#555;margin-bottom:14px}" +
      ".sb-subscribe-modal .sb-subscribe-kicker{color:#667085}" +
      ".sb-subscribe-modal .sb-subscribe-input{background:#f5f7fb;border:1px solid rgba(0,0,0,.14);color:#1d1d1f}" +
      ".sb-subscribe-modal .sb-subscribe-input::placeholder{color:#6b7280}" +
      ".sb-subscribe-modal .sb-subscribe-status.success{color:#15803d}" +
      ".sb-subscribe-modal .sb-subscribe-status.error{color:#b91c1c}" +
      "@media (max-width:768px){.sb-subscribe-widget{padding:0 16px}.sb-subscribe-title{font-size:20px}.sb-subscribe-modal-card{padding:20px}}";
    document.head.appendChild(style);
  }

  function mountFooterWidget(options) {
    ensureStyles();
    if (document.getElementById("sbFooterSubscribeWidget")) return null;
    var footer = document.querySelector("footer");
    if (!footer || !footer.parentNode) return null;

    var container = document.createElement("section");
    container.className = "sb-subscribe-widget";
    container.id = "sbFooterSubscribeWidget";
    container.innerHTML =
      '<div class="sb-subscribe-card">' +
      '<div class="sb-subscribe-kicker">Stay Tuned</div>' +
      '<h2 class="sb-subscribe-title">Subscribe for latest updates</h2>' +
      '<p class="sb-subscribe-desc">Get notified when new ServiceNow, AI, and certification posts are published.</p>' +
      '<form class="sb-subscribe-form" id="sbFooterSubscribeForm" target="sbSubscribePopup">' +
      '<input class="sb-subscribe-input" type="email" name="email" placeholder="Enter your email" required aria-label="Email address">' +
      '<button class="sb-subscribe-btn" type="submit">Subscribe</button>' +
      "</form>" +
      '<div class="sb-subscribe-status" data-subscribe-status role="status" aria-live="polite"></div>' +
      "</div>";

    footer.parentNode.insertBefore(container, footer);
    var form = container.querySelector("#sbFooterSubscribeForm");
    bindForm(form, options || {});
    return container;
  }

  function ensureModal(options) {
    ensureStyles();
    var existing = document.getElementById("sbSubscribeModal");
    if (existing) return existing;

    var modal = document.createElement("div");
    modal.id = "sbSubscribeModal";
    modal.className = "sb-subscribe-modal";
    modal.innerHTML =
      '<div class="sb-subscribe-modal-card" role="dialog" aria-modal="true" aria-labelledby="sbSubscribeModalTitle">' +
      '<button type="button" class="sb-subscribe-modal-close" aria-label="Close subscribe popup">&times;</button>' +
      '<div class="sb-subscribe-kicker">Enjoying this article?</div>' +
      '<h3 class="sb-subscribe-modal-title" id="sbSubscribeModalTitle">Get the next one in your inbox</h3>' +
      '<p class="sb-subscribe-modal-desc">Subscribe and I will send new posts on ServiceNow, AI builds, and certification prep.</p>' +
      '<form class="sb-subscribe-form" id="sbModalSubscribeForm" target="sbSubscribePopup">' +
      '<input class="sb-subscribe-input" type="email" name="email" placeholder="you@example.com" required aria-label="Email address">' +
      '<button class="sb-subscribe-btn" type="submit">Subscribe</button>' +
      "</form>" +
      '<div class="sb-subscribe-status" data-subscribe-status role="status" aria-live="polite"></div>' +
      "</div>";

    document.body.appendChild(modal);
    var closeBtn = modal.querySelector(".sb-subscribe-modal-close");
    closeBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", function (event) {
      if (event.target === modal) closeModal();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && modal.classList.contains("open")) closeModal();
    });

    bindForm(modal.querySelector("#sbModalSubscribeForm"), options || {});
    return modal;
  }

  function openModal(options) {
    var modal = ensureModal(options || {});
    var titleEl = modal.querySelector("#sbSubscribeModalTitle");
    var descEl = modal.querySelector(".sb-subscribe-modal-desc");
    if (options && options.title) titleEl.textContent = options.title;
    if (options && options.description) descEl.textContent = options.description;
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    var modal = document.getElementById("sbSubscribeModal");
    if (!modal) return;
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }

  function autoInit() {
    if (document.body && document.body.dataset.disableFooterSubscribe === "true") return;
    mountFooterWidget();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }

  window.SBSubscribe = {
    bindForm: bindForm,
    mountFooterWidget: mountFooterWidget,
    openModal: openModal,
    closeModal: closeModal,
  };
})();
