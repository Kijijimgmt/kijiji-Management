const root = document.documentElement;
const body = document.body;
const header = document.querySelector(".site-header");
const menuToggle = document.querySelector(".menu-toggle");
const primaryNav = document.querySelector(".primary-nav");
const cursorDot = document.querySelector(".cursor-dot");
const cursorRing = document.querySelector(".cursor-ring");
const finePointer = window.matchMedia("(pointer: fine)").matches;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const leadForm = document.querySelector("#strategy-session-form");
const scrollScenes = reduceMotion
  ? []
  : Array.from(document.querySelectorAll(".hero, .cinema, .partner, .system, .outcome, .invitation"));
const storyScenes = reduceMotion ? [] : Array.from(document.querySelectorAll("[data-scene]"));
const threadNodes = Array.from(document.querySelectorAll("[data-thread-node]"));
const cinemaSteps = Array.from(document.querySelectorAll(".cinema-step"));
const mapNodes = Array.from(document.querySelectorAll(".map-node"));
const partnerPhotos = Array.from(document.querySelectorAll(".partner-photo"));
const partnerArticles = Array.from(document.querySelectorAll(".partner-list article"));
const systemRows = Array.from(document.querySelectorAll(".system-list div"));
// Add the project URL and public anon/publishable key after the Supabase table
// and insert-only RLS policy are created. Never place a service_role key here.
const supabaseConfig = {
  url: "https://vaqgriohhcccvvxgkhgh.supabase.co",
  anonKey: "sb_publishable_DPHPYm5DJGMqw13aiZP76w_q7pNidrn",
  table: "strategy_session_leads",
  notificationEndpoint: "/api/strategy-session-lead",
  ...(window.KIJIJI_SUPABASE || {}),
};

const getTrackingValue = (key) => new URLSearchParams(window.location.search).get(key) || "";

const setStatus = (message, tone = "") => {
  if (!leadForm) {
    return;
  }

  const status = leadForm.querySelector(".form-status");

  if (!status) {
    return;
  }

  status.textContent = message;
  status.dataset.tone = tone;
};

const collectLeadPayload = () => {
  const formData = new FormData(leadForm);
  const servicesNeeded = formData.getAll("services_needed");

  return {
    full_name: String(formData.get("full_name") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    social_handle: String(formData.get("social_handle") || "").trim(),
    client_type: String(formData.get("client_type") || "").trim(),
    current_stage: String(formData.get("current_stage") || "").trim(),
    services_needed: servicesNeeded,
    biggest_bottleneck: String(formData.get("biggest_bottleneck") || "").trim(),
    preferred_contact: String(formData.get("preferred_contact") || "").trim(),
    budget_readiness: String(formData.get("budget_readiness") || "").trim(),
    utm_source: String(formData.get("utm_source") || ""),
    utm_medium: String(formData.get("utm_medium") || ""),
    utm_campaign: String(formData.get("utm_campaign") || ""),
    utm_content: String(formData.get("utm_content") || ""),
    utm_term: String(formData.get("utm_term") || ""),
    page_url: String(formData.get("page_url") || window.location.href),
    submitted_at: String(formData.get("submitted_at") || new Date().toISOString()),
    user_agent: window.navigator.userAgent,
    referrer: document.referrer,
  };
};

const configureTrackingFields = () => {
  if (!leadForm) {
    return;
  }

  ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((key) => {
    const field = leadForm.elements[key];

    if (field) {
      field.value = getTrackingValue(key);
    }
  });

  if (leadForm.elements.page_url) {
    leadForm.elements.page_url.value = window.location.href;
  }
};

const submitLeadToSupabase = async (payload) => {
  const endpoint = `${supabaseConfig.url.replace(/\/$/, "")}/rest/v1/${supabaseConfig.table}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: supabaseConfig.anonKey,
      Authorization: `Bearer ${supabaseConfig.anonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Supabase insert failed with status ${response.status}`);
  }
};

const submitLead = async (payload) => {
  if (supabaseConfig.notificationEndpoint) {
    const response = await fetch(supabaseConfig.notificationEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return;
    }

    console.warn(`Notification endpoint failed with status ${response.status}. Falling back to direct Supabase insert.`);
  }

  await submitLeadToSupabase(payload);
};

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = document.querySelector(link.getAttribute("href"));

    if (!target) {
      return;
    }

    event.preventDefault();
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });

    if (primaryNav.classList.contains("is-open")) {
      primaryNav.classList.remove("is-open");
      menuToggle.setAttribute("aria-expanded", "false");
    }
  });
});

if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    const isOpen = primaryNav.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

const revealTargets = document.querySelectorAll("[data-reveal], .hero-stagger");

if ("IntersectionObserver" in window && !reduceMotion) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.18 }
  );

  revealTargets.forEach((target, index) => {
    target.style.transitionDelay = target.classList.contains("hero-stagger") ? `${index * 90}ms` : "0ms";
    revealObserver.observe(target);
  });
} else {
  revealTargets.forEach((target) => target.classList.add("is-visible"));
}

window.addEventListener(
  "scroll",
  () => {
    if (!header) {
      return;
    }

    header.classList.toggle("is-scrolled", window.scrollY > 12);
  },
  { passive: true }
);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
let ticking = false;

const updateScrollEffects = () => {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const pageProgress = scrollable > 0 ? window.scrollY / scrollable : 0;
  root.style.setProperty("--page-progress", clamp(pageProgress, 0, 1).toFixed(4));
  let activeSceneIndex = 0;

  scrollScenes.forEach((scene) => {
    const rect = scene.getBoundingClientRect();
    const progress = clamp((window.innerHeight - rect.top) / (window.innerHeight + rect.height), 0, 1);
    const depth = progress - 0.5;

    scene.style.setProperty("--scene-progress", progress.toFixed(4));
    scene.style.setProperty("--scene-depth", depth.toFixed(4));
    scene.style.setProperty("--scene-y", `${(depth * -56).toFixed(2)}px`);
    scene.style.setProperty("--scene-y-soft", `${(depth * -22).toFixed(2)}px`);
    scene.style.setProperty("--scene-y-reverse", `${(depth * 16).toFixed(2)}px`);
    scene.style.setProperty("--scene-x", `${(depth * 76).toFixed(2)}px`);
    scene.style.setProperty("--scene-x-soft", `${(depth * 34).toFixed(2)}px`);
    scene.style.setProperty("--scene-x-reverse", `${(depth * -53).toFixed(2)}px`);

    if (scene.matches(".cinema")) {
      const stepIndex = clamp(Math.floor(clamp((progress - 0.16) / 0.64, 0, 0.999) * cinemaSteps.length), 0, cinemaSteps.length - 1);

      cinemaSteps.forEach((step, index) => step.classList.toggle("is-active", index === stepIndex));
      mapNodes.forEach((node, index) => node.classList.toggle("is-active", index === stepIndex));
    }

    if (scene.matches(".partner")) {
      const partnerIndex = clamp(Math.floor(clamp((progress - 0.08) / 0.78, 0, 0.999) * partnerPhotos.length), 0, partnerPhotos.length - 1);

      partnerPhotos.forEach((photo, index) => photo.classList.toggle("is-active", index === partnerIndex));
      partnerArticles.forEach((article, index) => article.classList.toggle("is-active", index === partnerIndex));
    }

    if (scene.matches(".system")) {
      const systemIndex = clamp(Math.floor(clamp((progress - 0.12) / 0.72, 0, 0.999) * systemRows.length), 0, systemRows.length - 1);

      systemRows.forEach((row, index) => row.classList.toggle("is-active", index === systemIndex));
    }
  });

  storyScenes.forEach((scene, index) => {
    const rect = scene.getBoundingClientRect();
    const crossesReadingLine = rect.top <= window.innerHeight * 0.56 && rect.bottom >= window.innerHeight * 0.32;

    if (crossesReadingLine) {
      activeSceneIndex = index;
    }
  });

  storyScenes.forEach((scene, index) => {
    scene.classList.toggle("is-active-scene", index === activeSceneIndex);
    scene.classList.toggle("is-past-scene", index < activeSceneIndex);
  });

  threadNodes.forEach((node, index) => {
    node.classList.toggle("is-active", index === activeSceneIndex);
    node.classList.toggle("is-past", index < activeSceneIndex);
  });

  ticking = false;
};

const requestScrollEffects = () => {
  if (ticking) {
    return;
  }

  ticking = true;
  requestAnimationFrame(updateScrollEffects);
};

updateScrollEffects();
window.addEventListener("scroll", requestScrollEffects, { passive: true });
window.addEventListener("resize", requestScrollEffects);

if (finePointer && !reduceMotion && cursorDot && cursorRing) {
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let ringX = mouseX;
  let ringY = mouseY;

  window.addEventListener(
    "pointermove",
    (event) => {
      mouseX = event.clientX;
      mouseY = event.clientY;
      body.classList.add("cursor-ready");
      cursorDot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
    },
    { passive: true }
  );

  const animateCursor = () => {
    ringX += (mouseX - ringX) * 0.18;
    ringY += (mouseY - ringY) * 0.18;
    cursorRing.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
    requestAnimationFrame(animateCursor);
  };

  animateCursor();

  document.querySelectorAll("a, button, .interactive-card").forEach((target) => {
    target.addEventListener("pointerenter", () => body.classList.add("cursor-active"));
    target.addEventListener("pointerleave", () => body.classList.remove("cursor-active"));
  });
}

if (leadForm) {
  configureTrackingFields();

  leadForm.addEventListener("input", (event) => {
    if (event.target.matches("input, select, textarea")) {
      event.target.removeAttribute("aria-invalid");
    }
  });

  leadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    configureTrackingFields();

    if (leadForm.elements.submitted_at) {
      leadForm.elements.submitted_at.value = new Date().toISOString();
    }

    const requiredFields = leadForm.querySelectorAll("[required]");
    const invalidFields = Array.from(requiredFields).filter((field) => !field.value.trim());

    requiredFields.forEach((field) => field.removeAttribute("aria-invalid"));

    if (invalidFields.length) {
      invalidFields.forEach((field) => field.setAttribute("aria-invalid", "true"));
      invalidFields[0].focus();
      setStatus("Please complete the highlighted fields.", "error");
      return;
    }

    const payload = collectLeadPayload();
    const submitButton = leadForm.querySelector('button[type="submit"]');
    const hasSupabaseCredentials = Boolean(supabaseConfig.url && supabaseConfig.anonKey);

    if (leadForm.elements.company_website?.value) {
      setStatus("Request received. We'll follow up with next steps shortly.", "success");
      return;
    }

    if (!hasSupabaseCredentials) {
      window.dispatchEvent(new CustomEvent("kijiji:lead-ready", { detail: payload }));
      setStatus("Form is ready. Add Supabase URL and anon key in script.js to start collecting submissions.", "success");
      return;
    }

    try {
      submitButton.disabled = true;
      submitButton.textContent = "Submitting...";
      setStatus("Submitting your request...");

      await submitLead(payload);

      leadForm.reset();
      configureTrackingFields();
      setStatus("Request received. We'll follow up with next steps shortly.", "success");
    } catch (error) {
      console.error(error);
      setStatus("Something went wrong. Please try again or contact Kijiji directly.", "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Submit Strategy Request";
    }
  });
}

if (!reduceMotion) {
  document.querySelectorAll(".magnetic").forEach((element) => {
    element.addEventListener("pointermove", (event) => {
      if (!finePointer) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      element.style.transform = `translate(${x * 0.18}px, ${y * 0.24}px)`;
    });

    element.addEventListener("pointerleave", () => {
      element.style.transform = "translate(0, 0)";
    });
  });
}

root.style.setProperty("--viewport-height", `${window.innerHeight}px`);
