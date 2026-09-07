const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const PORTAL_ACCESS_CODE = process.env.PORTAL_ACCESS_CODE;

const TEAM_MEMBERS = {
  "max@kijijimgmt.com": {
    email: "max@kijijimgmt.com",
    fullName: "Maxwell",
    owner: "Maxwell",
    role: "admin",
  },
  "joe@kijijimgmt.com": {
    email: "joe@kijijimgmt.com",
    fullName: "Joe",
    owner: "Joe",
    role: "member",
  },
  "erik@kijijimgmt.com": {
    email: "erik@kijijimgmt.com",
    fullName: "Erik",
    owner: "Erik",
    role: "member",
  },
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const ownerKey = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (text === "max" || text === "maxwell") return "maxwell";
  if (text === "joe") return "joe";
  if (text === "erik") return "erik";
  return text;
};

const ownerMatches = (value, owner) => ownerKey(value) === ownerKey(owner);

const getBearerToken = (request) => {
  const auth = request.headers.authorization || request.headers.Authorization || "";
  const match = String(auth).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
};

const authError = (statusCode, code, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const verifySupabaseUser = async (token) => {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw authError(503, "supabase_auth_not_configured", "Supabase Auth is not configured for the team portal.");
  }

  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw authError(401, "team_auth_invalid", "Your secure session expired. Sign in again with your Kijiji email.");
  }

  return response.json();
};

const verifyLegacyPasscode = (request) => {
  if (process.env.ALLOW_PORTAL_CODE_FALLBACK !== "true") {
    return null;
  }

  if (!PORTAL_ACCESS_CODE) {
    throw authError(503, "portal_access_not_configured", "Portal access code fallback is enabled but not configured.");
  }

  const accessCode = request.headers["x-portal-access-code"];
  if (accessCode !== PORTAL_ACCESS_CODE) {
    throw authError(401, "team_auth_required", "Sign in with an approved Kijiji email.");
  }

  return {
    authMode: "passcode",
    email: "",
    fullName: "Passcode Admin",
    owner: "Maxwell",
    role: "admin",
    isAdmin: true,
  };
};

const publicIdentity = (identity) => ({
  authMode: identity.authMode,
  email: identity.email,
  fullName: identity.fullName,
  owner: identity.owner,
  role: identity.role,
  isAdmin: Boolean(identity.isAdmin),
});

const verifyTeamAccess = async (request) => {
  const token = getBearerToken(request);

  if (!token) {
    const legacyIdentity = verifyLegacyPasscode(request);
    if (legacyIdentity) {
      return legacyIdentity;
    }

    throw authError(401, "team_auth_required", "Sign in with an approved Kijiji email.");
  }

  const user = await verifySupabaseUser(token);
  const email = normalizeEmail(user.email);
  const member = TEAM_MEMBERS[email];

  if (!member) {
    throw authError(403, "team_member_not_allowed", "This email is not approved for the Kijiji team portal.");
  }

  return {
    ...member,
    authMode: "supabase",
    isAdmin: member.role === "admin",
    supabaseUserId: user.id,
  };
};

const getClientRelations = (item) => ({
  ids: Array.isArray(item?.clientIds) ? item.clientIds.filter(Boolean) : [],
  name: String(item?.clientName || "").trim().toLowerCase(),
});

const filterDashboardForIdentity = (dashboard, identity) => {
  const withUser = {
    ...dashboard,
    source: {
      ...(dashboard.source || {}),
      user: publicIdentity(identity),
    },
  };

  if (identity.isAdmin) {
    return withUser;
  }

  const ownedActions = (dashboard.actions || []).filter((item) => ownerMatches(item.owner, identity.owner));
  const ownedOpportunities = (dashboard.opportunities || []).filter((item) => ownerMatches(item.owner, identity.owner));
  const ownedEvents = (dashboard.events || []).filter((item) => ownerMatches(item.owner, identity.owner));
  const relatedIds = new Set();
  const relatedNames = new Set();

  [...ownedActions, ...ownedOpportunities, ...ownedEvents].forEach((item) => {
    const relations = getClientRelations(item);
    relations.ids.forEach((id) => relatedIds.add(id));
    if (relations.name) relatedNames.add(relations.name);
  });

  const ownedClients = (dashboard.clients || []).filter((client) => {
    const clientName = String(client.name || "").trim().toLowerCase();
    return ownerMatches(client.owner, identity.owner) || relatedIds.has(client.id) || relatedNames.has(clientName);
  });

  return {
    ...withUser,
    clients: ownedClients,
    actions: ownedActions,
    opportunities: ownedOpportunities,
    events: ownedEvents,
  };
};

const forbiddenScope = (message) => authError(403, "team_scope_forbidden", message);

const assertCanManageClient = (identity) => {
  if (!identity.isAdmin) {
    throw forbiddenScope("Client roster edits are limited to Max. Joe and Erik can manage their assigned tasks, deals, and events.");
  }
};

const assertCanManageOwnedRecord = (record, identity, label) => {
  if (identity.isAdmin) {
    return;
  }

  if (!ownerMatches(record?.owner, identity.owner)) {
    throw forbiddenScope(`${label} updates are limited to records assigned to ${identity.fullName}.`);
  }
};

const assignMemberOwner = (record, identity) => {
  if (!identity.isAdmin) {
    record.owner = identity.owner;
  }
};

module.exports = {
  assertCanManageClient,
  assertCanManageOwnedRecord,
  assignMemberOwner,
  filterDashboardForIdentity,
  ownerMatches,
  publicIdentity,
  TEAM_MEMBERS,
  verifyTeamAccess,
};
