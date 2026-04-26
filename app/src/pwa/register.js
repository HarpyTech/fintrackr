const SERVICE_WORKER_URL = "/service-worker.js";

function canUseServiceWorker() {
  if (typeof window === "undefined") {
    return false;
  }

  if (!("serviceWorker" in navigator)) {
    console.info("PWA: service workers are not supported in this browser.");
    return false;
  }

  const { hostname, protocol } = window.location;
  return (
    window.isSecureContext ||
    protocol === "https:" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1"
  );
}

async function registerServiceWorker() {
  if (!canUseServiceWorker()) {
    console.info(
      "PWA: service worker registration skipped because HTTPS or localhost is required."
    );
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register(
      SERVICE_WORKER_URL,
      { scope: "/" }
    );
    console.info("PWA: service worker registered.", registration.scope);
    window.dispatchEvent(
      new CustomEvent("pwa:sw-registered", {
        detail: { scope: registration.scope }
      })
    );

    registration.addEventListener("updatefound", () => {
      const installingWorker = registration.installing;
      if (!installingWorker) {
        return;
      }

      installingWorker.addEventListener("statechange", () => {
        if (
          installingWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          console.info(
            "PWA: updated content is available and will be used on the next refresh."
          );
        }
      });
    });
  } catch (error) {
    console.error("PWA: service worker registration failed.", error);
    window.dispatchEvent(new CustomEvent("pwa:sw-error", { detail: error }));
  }
}

window.addEventListener("load", () => {
  registerServiceWorker();
});
