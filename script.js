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
