export type PermissionId =
  | "events.view"
  | "events.create"
  | "events.edit"
  | "events.delete"
  | "routes.view"
  | "routes.create"
  | "routes.edit"
  | "routes.delete"
  | "content.view"
  | "content.edit"
  | "content.publish"
  | "content.delete"
  | "support.view"
  | "support.reply"
  | "support.assign"
  | "support.close"
  | "community.view"
  | "community.moderate"
  | "community.warnings"
  | "community.reports"
  | "users.view"
  | "users.edit"
  | "users.roles"
  | "users.suspend"
  | "status.view"
  | "status.edit"
  | "settings.view"
  | "settings.edit"
  | "settings.roles"
  | "settings.audit"
  | "service.source";

export const SERVICE_SOURCE_PERMISSION: PermissionId = "service.source";

export type StaffRoleId =
  | "admin"
  | "operations"
  | "events"
  | "support"
  | "content-editor"
  | "moderator"
  | (string & {});

export type StaffRoleTemplate = {
  id: StaffRoleId;
  name: string;
  description: string;
  permissions: PermissionId[];
  system: boolean;
};

export type PermissionGroup = {
  id: string;
  label: string;
  icon: string;
  permissions: Array<{
    id: PermissionId;
    label: string;
    description: string;
    highLevel?: boolean;
  }>;
};

// Service Settings intentionally does not appear in these general permission groups.
// Its source-code permission is delegated only from the Master Admin's Service Settings page.
export const permissionGroups: PermissionGroup[] = [
  {
    id: "events",
    label: "Events",
    icon: "▣",
    permissions: [
      { id: "events.view", label: "View events", description: "See staff-only event information." },
      { id: "events.create", label: "Create events", description: "Create new virtual-airline events." },
      { id: "events.edit", label: "Edit events", description: "Change event details, routes, rewards and status." },
      { id: "events.delete", label: "Delete events", description: "Remove or cancel events.", highLevel: true },
    ],
  },
  {
    id: "routes",
    label: "Routes & Schedules",
    icon: "✈",
    permissions: [
      { id: "routes.view", label: "View routes", description: "Access staff route and schedule information." },
      { id: "routes.create", label: "Create routes", description: "Add new route and schedule records." },
      { id: "routes.edit", label: "Edit schedules", description: "Change aircraft, times, availability and route details." },
      { id: "routes.delete", label: "Delete routes", description: "Remove routes from the virtual network.", highLevel: true },
    ],
  },
  {
    id: "content",
    label: "Website Content",
    icon: "▤",
    permissions: [
      { id: "content.view", label: "View pages", description: "Open website content-management tools." },
      { id: "content.edit", label: "Edit pages", description: "Modify editable website text, images and content." },
      { id: "content.publish", label: "Publish content", description: "Publish approved drafts to the live virtual-airline website.", highLevel: true },
      { id: "content.delete", label: "Delete content", description: "Remove editable website content.", highLevel: true },
    ],
  },
  {
    id: "support",
    label: "Support Inbox",
    icon: "✉",
    permissions: [
      { id: "support.view", label: "View tickets", description: "Read pilot support requests." },
      { id: "support.reply", label: "Reply to tickets", description: "Respond to pilots as British Airways Virtual staff." },
      { id: "support.assign", label: "Manage assignments", description: "Assign support cases to other staff members." },
      { id: "support.close", label: "Close tickets", description: "Mark support cases resolved or closed." },
    ],
  },
  {
    id: "community",
    label: "Community / Discord",
    icon: "◎",
    permissions: [
      { id: "community.view", label: "View discussions", description: "Access staff community-management tools." },
      { id: "community.moderate", label: "Moderate content", description: "Moderate community content and discussions." },
      { id: "community.warnings", label: "Manage warnings", description: "Issue or remove community warnings." },
      { id: "community.reports", label: "Access reports", description: "Review submitted community reports." },
    ],
  },
  {
    id: "users",
    label: "User Management",
    icon: "♙",
    permissions: [
      { id: "users.view", label: "View user accounts", description: "Search and inspect staff and pilot account information." },
      { id: "users.edit", label: "Edit user details", description: "Correct permitted account information." },
      { id: "users.roles", label: "Assign roles", description: "Grant, change or remove staff roles and permission overrides.", highLevel: true },
      { id: "users.suspend", label: "Suspend accounts", description: "Temporarily suspend permitted user accounts.", highLevel: true },
    ],
  },
  {
    id: "service-status",
    label: "Service Status",
    icon: "◔",
    permissions: [
      { id: "status.view", label: "View status manager", description: "Open the staff Service Status Manager and inspect operational data." },
      { id: "status.edit", label: "Publish status updates", description: "Change component health, publish incidents and schedule maintenance.", highLevel: true },
    ],
  },
  {
    id: "settings",
    label: "System Settings",
    icon: "⚙",
    permissions: [
      { id: "settings.view", label: "View settings", description: "View virtual-airline system configuration." },
      { id: "settings.edit", label: "Edit settings", description: "Change operational system settings.", highLevel: true },
      { id: "settings.roles", label: "Manage role templates", description: "Create and edit staff role templates.", highLevel: true },
      { id: "settings.audit", label: "Access audit logs", description: "Review staff changes and permission history.", highLevel: true },
    ],
  },
];

export const allPermissions = permissionGroups.flatMap((group) => group.permissions.map((permission) => permission.id));
export const masterPermissions: PermissionId[] = [...allPermissions, SERVICE_SOURCE_PERMISSION];

export const permissionDependencies: Partial<Record<PermissionId, PermissionId[]>> = {
  "events.create": ["events.view"],
  "events.edit": ["events.view"],
  "events.delete": ["events.view", "events.edit"],
  "routes.create": ["routes.view"],
  "routes.edit": ["routes.view"],
  "routes.delete": ["routes.view", "routes.edit"],
  "content.edit": ["content.view"],
  "content.publish": ["content.view", "content.edit"],
  "content.delete": ["content.view", "content.edit"],
  "support.reply": ["support.view"],
  "support.assign": ["support.view"],
  "support.close": ["support.view"],
  "community.moderate": ["community.view"],
  "community.warnings": ["community.view"],
  "community.reports": ["community.view"],
  "users.edit": ["users.view"],
  "users.roles": ["users.view"],
  "users.suspend": ["users.view"],
  "status.edit": ["status.view"],
  "settings.edit": ["settings.view"],
  "settings.roles": ["settings.view", "users.view", "users.roles"],
  "settings.audit": ["settings.view"],
};

export const defaultRoleTemplates: StaffRoleTemplate[] = [
  {
    id: "admin",
    name: "Admin",
    description: "Full operational access except protected Master Admin service-source access.",
    permissions: [...allPermissions],
    system: true,
  },
  {
    id: "operations",
    name: "Operations",
    description: "Manage routes, schedules and operational tools.",
    permissions: [
      "events.view",
      "routes.view",
      "routes.create",
      "routes.edit",
      "content.view",
      "users.view",
      "status.view",
    ],
    system: true,
  },
  {
    id: "events",
    name: "Events",
    description: "Create, edit and publish virtual-airline events.",
    permissions: ["events.view", "events.create", "events.edit", "events.delete"],
    system: true,
  },
  {
    id: "support",
    name: "Support",
    description: "Manage the support inbox and user queries.",
    permissions: ["support.view", "support.reply", "support.assign", "support.close", "users.view", "status.view"],
    system: true,
  },
  {
    id: "content-editor",
    name: "Content Editor",
    description: "Edit website content, pages and media.",
    permissions: ["content.view", "content.edit", "content.publish"],
    system: true,
  },
  {
    id: "moderator",
    name: "Moderator",
    description: "Community management and Discord moderation.",
    permissions: ["community.view", "community.moderate", "community.warnings", "community.reports"],
    system: true,
  },
];

export function expandPermissionDependencies(input: Iterable<PermissionId>) {
  const resolved = new Set<PermissionId>(input);
  let changed = true;
  while (changed) {
    changed = false;
    for (const permission of [...resolved]) {
      for (const dependency of permissionDependencies[permission] ?? []) {
        if (!resolved.has(dependency)) {
          resolved.add(dependency);
          changed = true;
        }
      }
    }
  }
  return resolved;
}

export function rolePermissions(role: StaffRoleTemplate | undefined) {
  return expandPermissionDependencies(role?.permissions ?? []);
}

export function effectivePermissions(
  role: StaffRoleTemplate | undefined,
  overrides: Partial<Record<PermissionId, boolean>> | undefined,
) {
  const permissions = rolePermissions(role);
  for (const [permission, granted] of Object.entries(overrides ?? {}) as Array<[PermissionId, boolean]>) {
    if (granted) permissions.add(permission);
    else permissions.delete(permission);
  }
  return expandPermissionDependencies(permissions);
}

export function permissionLabel(id: PermissionId) {
  if (id === SERVICE_SOURCE_PERMISSION) return "Service Settings → Source code editor";
  for (const group of permissionGroups) {
    const permission = group.permissions.find((item) => item.id === id);
    if (permission) return `${group.label} → ${permission.label}`;
  }
  return id;
}
