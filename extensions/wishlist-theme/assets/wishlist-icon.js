(function () {
  "use strict";

  if (window.__wishlistApp) return;

  var STORAGE_KEY = "wishlist";
  var LIQUID_LIST_LIMIT = 50;
  var PRODUCT_GID = /^gid:\/\/shopify\/Product\/\d+$/;
  var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
  var PROXY_URL = root.replace(/\/?$/, "/") + "apps/wishlist";

  var state = {
    loggedIn: null,
    saved: new Set(),
    known: false,
    pending: new Set(),
    ready: null,
    ensuring: null,
  };

  function toGid(value) {
    var raw = value && typeof value === "object" ? value.id : value;
    if (typeof raw === "number") raw = String(raw);
    if (typeof raw !== "string") return null;
    if (PRODUCT_GID.test(raw)) return raw;
    return /^\d+$/.test(raw) ? "gid://shopify/Product/" + raw : null;
  }

  function normalize(list) {
    var out = [];
    var seen = new Set();
    (Array.isArray(list) ? list : []).forEach(function (item) {
      var gid = toGid(item);
      if (gid && !seen.has(gid)) {
        seen.add(gid);
        out.push(gid);
      }
    });
    return out;
  }

  function readLocal() {
    try {
      return normalize(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]"));
    } catch (err) {
      return [];
    }
  }

  function writeLocal(ids) {
    try {
      if (ids.length) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      // Storage can be unavailable (private mode, blocked cookies); the in-memory state still works.
    }
  }

  function request(method, body) {
    return fetch(PROXY_URL, {
      method: method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (payload) {
          if (!res.ok) throw new Error(payload.error || "HTTP " + res.status);
          return normalize(payload.ids);
        });
    });
  }

  function blocks() {
    return document.querySelectorAll("[data-wishlist-block][data-wishlist-bound]");
  }

  function render() {
    blocks().forEach(function (block) {
      var active = state.saved.has(block.dataset.productId);
      var button = block.querySelector("[data-wishlist-button]");
      if (!button) return;
      var label = active ? block.dataset.labelRemove : block.dataset.labelAdd;
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.setAttribute("aria-label", label);
      button.title = label;
      if (state.pending.has(block.dataset.productId)) {
        button.setAttribute("aria-busy", "true");
      } else {
        button.removeAttribute("aria-busy");
      }
      var text = block.querySelector("[data-wishlist-label]");
      if (text) text.textContent = label;
      block.classList.toggle("is-active", active);
    });
  }

  function announce() {
    var ids = Array.from(state.saved);
    document.dispatchEvent(
      new CustomEvent("wishlist:change", { detail: { ids: ids, count: ids.length } }),
    );
  }

  function setSaved(ids, known) {
    state.saved = new Set(ids);
    if (known) state.known = true;
    render();
    announce();
  }

  var toast = null;
  var toastTimer = null;

  function showToast(block, message, withLogin) {
    if (!message) return;
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "wishlist-app-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.replaceChildren();
    var text = document.createElement("span");
    text.textContent = message;
    toast.appendChild(text);
    if (withLogin && block.dataset.loginUrl) {
      var link = document.createElement("a");
      link.href = block.dataset.loginUrl;
      link.textContent = block.dataset.toastLogin || "Log in";
      toast.appendChild(link);
    }
    toast.dataset.visible = "true";
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.dataset.visible = "false";
    }, 4000);
  }

  function start(firstBlock) {
    state.loggedIn = firstBlock.dataset.loggedIn === "true";

    if (!state.loggedIn) {
      state.saved = new Set(readLocal());
      state.known = true;
      state.ready = Promise.resolve();
      window.addEventListener("storage", function (event) {
        if (event.key === STORAGE_KEY) setSaved(readLocal(), true);
      });
      return;
    }

    var guestItems = readLocal();
    if (guestItems.length) {
      state.ready = request("POST", { action: "merge", wishlist: guestItems })
        .then(function (ids) {
          writeLocal([]);
          setSaved(ids, true);
        })
        .catch(function () {});
    } else {
      state.ready = Promise.resolve();
    }
  }

  function ensureKnown() {
    if (state.known || state.ensuring) return;
    state.ensuring = request("GET")
      .then(function (ids) {
        setSaved(ids, true);
      })
      .catch(function () {})
      .finally(function () {
        state.ensuring = null;
      });
  }

  function toggle(block) {
    var id = block.dataset.productId;
    if (!id || state.pending.has(id)) return;

    var wasSaved = state.saved.has(id);
    var previous = Array.from(state.saved);
    var next = new Set(state.saved);
    if (wasSaved) next.delete(id);
    else next.add(id);
    setSaved(Array.from(next), false);

    if (!state.loggedIn) {
      writeLocal(Array.from(state.saved));
      if (!wasSaved) showToast(block, block.dataset.toastGuest, true);
      return;
    }

    state.pending.add(id);
    render();
    Promise.resolve(state.ready)
      .then(function () {
        return request("POST", { action: wasSaved ? "remove" : "add", productId: id });
      })
      .then(function (ids) {
        state.pending.delete(id);
        setSaved(ids, true);
      })
      .catch(function () {
        state.pending.delete(id);
        setSaved(previous, false);
        showToast(block, block.dataset.toastError, false);
      });
  }

  function bind(block) {
    block.dataset.wishlistBound = "true";
    if (state.loggedIn === null) start(block);

    var id = block.dataset.productId;
    if (state.loggedIn && !state.known) {
      if (block.dataset.saved === "true") state.saved.add(id);
      if (Number(block.dataset.wishlistCount) > LIQUID_LIST_LIMIT) ensureKnown();
    }

    var button = block.querySelector("[data-wishlist-button]");
    if (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        toggle(block);
      });
    }
  }

  var scheduled = false;

  function scan() {
    scheduled = false;
    var fresh = document.querySelectorAll("[data-wishlist-block]:not([data-wishlist-bound])");
    if (!fresh.length) return;
    fresh.forEach(bind);
    render();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(scan);
  }

  window.__wishlistApp = {
    getIds: function () {
      return Array.from(state.saved);
    },
  };

  function init() {
    scan();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
