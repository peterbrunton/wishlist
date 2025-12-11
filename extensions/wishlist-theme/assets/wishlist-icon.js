(function () {
  const STORAGE_KEY = "wishlist";
  const blocks = document.querySelectorAll("[data-wishlist-block]");

  if (!blocks.length) {
    return;
  }

  const proxyEndpoint = `${(window.Shopify?.routes?.root || "").replace(/\/$/, "")}/apps/wishlist`;
  const defaultCurrency =
    window.Shopify?.currency?.active ||
    window.Shopify?.currency?.current ||
    document.documentElement.getAttribute("data-shopify-currency") ||
    "USD";

  const state = {
    loaded: false,
    items: [],
    customerId: null,
  };

  let toastElement = null;
  let toastTimeout = null;

  const ensureToastElement = () => {
    if (toastElement) {
      return toastElement;
    }

    toastElement = document.createElement("div");
    toastElement.setAttribute("role", "status");
    toastElement.setAttribute("aria-live", "polite");
    toastElement.style.position = "fixed";
    toastElement.style.left = "50%";
    toastElement.style.bottom = "24px";
    toastElement.style.transform = "translateX(-50%)";
    toastElement.style.background = "rgba(0, 0, 0, 0.85)";
    toastElement.style.color = "#fff";
    toastElement.style.padding = "12px 18px";
    toastElement.style.borderRadius = "999px";
    toastElement.style.fontSize = "14px";
    toastElement.style.fontWeight = "500";
    toastElement.style.boxShadow = "0 8px 16px rgba(0, 0, 0, 0.25)";
    toastElement.style.zIndex = "2147483647";
    toastElement.style.opacity = "0";
    toastElement.style.pointerEvents = "none";
    toastElement.style.transition = "opacity 150ms ease";
    document.body.appendChild(toastElement);
    return toastElement;
  };

  const showGuestToast = (message) => {
    const toast = ensureToastElement();
    const displayMessage =
      message ||
      "Log in to keep your wishlist synced across devices.";

    toast.textContent = displayMessage;
    toast.style.opacity = "1";

    if (toastTimeout) {
      window.clearTimeout(toastTimeout);
    }

    toastTimeout = window.setTimeout(() => {
      toast.style.opacity = "0";
    }, 4000);
  };

  const dedupeById = (items = []) => {
    const map = new Map();
    items.forEach((item) => {
      if (item && item.id) {
        map.set(item.id, item);
      }
    });
    return Array.from(map.values());
  };

  const readLocal = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error("Wishlist local read failed", err);
      return [];
    }
  };

  const writeLocal = (items) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items ?? []));
    } catch (err) {
      console.error("Wishlist local write failed", err);
    }
  };

  const buildProductPayload = (dataset) => {
    const cents = Number(dataset.productPrice);
    const amount =
      Number.isFinite(cents) && !Number.isNaN(cents) ? (cents / 100).toFixed(2) : null;

    let imageUrl = dataset.productImage || null;
    if (imageUrl && imageUrl.startsWith("//")) {
      imageUrl = `https:${imageUrl}`;
    }

    return {
      id: dataset.productId,
      handle: dataset.productHandle || null,
      title: dataset.productTitle || "",
      onlineStoreUrl: dataset.productUrl || null,
      featuredImage: imageUrl ? { url: imageUrl } : null,
      priceRange: {
        minVariantPrice: {
          amount,
          currencyCode: dataset.productCurrency || defaultCurrency,
        },
      },
    };
  };

  const fetchServer = async (params = {}) => {
    const search = new URLSearchParams({ ...params });

    const response = await fetch(`${proxyEndpoint}?${search.toString()}`, {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Wishlist fetch failed with status ${response.status}`);
    }

    const payload = await response.json();
    return Array.isArray(payload?.wishlist) ? payload.wishlist : [];
  };

  const postServer = async (body) => {
    const response = await fetch(proxyEndpoint, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Wishlist update failed with status ${response.status}`);
    }

    const payload = await response.json();
    return Array.isArray(payload?.wishlist) ? payload.wishlist : [];
  };

  const ensureState = async (customerId) => {
    if (state.loaded) {
      return state.items;
    }

    state.customerId = customerId || null;
    let localItems = readLocal();

    if (customerId) {
      try {
        if (localItems.length) {
          const merged = await postServer({
            action: "sync",
            wishlist: localItems,
          });
          state.items = merged;
          writeLocal([]);
        }
      } catch (err) {
        console.error("Wishlist sync error", err);
        state.items = dedupeById(localItems);
      }

      try {
        const remoteItems = await fetchServer();
        state.items = dedupeById([...(state.items || []), ...remoteItems]);
      } catch (err) {
        console.error("Wishlist remote fetch error", err);
        state.items = dedupeById(state.items.length ? state.items : localItems);
      }
    } else {
      state.items = dedupeById(localItems);
    }

    state.loaded = true;
    return state.items;
  };

  const updateLocalState = (items) => {
    state.items = items;
    if (!state.customerId) {
      writeLocal(items);
    }
  };

  const toggleWishlist = async (product, customerId, block) => {
    const exists = state.items.some((item) => item?.id === product.id);
    const previous = state.items.slice();

    const updated = exists
      ? state.items.filter((item) => item?.id !== product.id)
      : dedupeById([...state.items, product]);

    updateLocalState(updated);

    if (!customerId) {
      if (!exists) {
        const message =
          block?.dataset?.loginMessage ||
          block?.dataset?.buttonAdd ||
          null;
        showGuestToast(message);
      }
      return updated;
    }

    try {
      const serverItems = await postServer({
        action: exists ? "remove" : "add",
        product,
      });
      updateLocalState(serverItems);
      return serverItems;
    } catch (err) {
      console.error("Wishlist server update error", err);
      updateLocalState(previous);
      return previous;
    }
  };

  const setButtonState = (block, active) => {
    const button = block.querySelector("[data-wishlist-button]");
    const iconOutline = block.querySelector('[data-wishlist-icon="outline"]');
    const iconSolid = block.querySelector('[data-wishlist-icon="solid"]');

    if (!button) return;

    button.setAttribute("aria-pressed", active ? "true" : "false");
    block.classList.toggle("is-active", Boolean(active));

    if (iconOutline && iconSolid) {
      iconOutline.style.display = active ? "none" : "inline-flex";
      iconSolid.style.display = active ? "inline-flex" : "none";
    }

    if (button.dataset.titleAdd && button.dataset.titleRemove) {
      button.title = active
        ? button.dataset.titleRemove
        : button.dataset.titleAdd;
    }
  };

  const initializeBlock = async (block) => {
    const dataset = block.dataset;
    const button = block.querySelector("[data-wishlist-button]");

    if (!button || !dataset.productId) {
      return;
    }

    const product = buildProductPayload(dataset);
    const customerId = dataset.customerId || null;

    await ensureState(customerId);
    const isSaved = state.items.some((item) => item?.id === product.id);
    setButtonState(block, isSaved);

    button.addEventListener("click", async () => {
      button.disabled = true;
      const updated = await toggleWishlist(product, customerId, block);
      setButtonState(
        block,
        updated.some((item) => item?.id === product.id)
      );
      button.disabled = false;
    });
  };

  blocks.forEach((block) => {
    initializeBlock(block);
  });
})();
