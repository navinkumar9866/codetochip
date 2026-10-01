import { buildCollection, type AuthController, type Permissions } from '@firecms/core';
import { boards } from '@codetochip/boards';
import {
  COLLECTIONS,
  PROJECT_LIMITS,
  type Example,
  type Lesson,
  type Page,
  type Role,
  type SiteSettings,
  type UserProfile,
} from '@codetochip/data';

/** Set by the authenticator in App.tsx from the user's `role` custom claim. */
export interface AdminExtra {
  role: Role;
}

const roleOf = (authController: AuthController): Role | undefined =>
  (authController.extra as AdminExtra | undefined)?.role;

// UI permissions mirror firebase/firestore.rules. The rules are what actually enforce them.
const editorCanWrite = ({ authController }: { authController: AuthController }): Permissions => {
  const role = roleOf(authController);
  const write = role === 'editor' || role === 'admin';
  return { read: true, create: write, edit: write, delete: write };
};
const adminOnly = ({ authController }: { authController: AuthController }): Permissions => {
  const admin = roleOf(authController) === 'admin';
  return { read: admin, create: admin, edit: admin, delete: admin };
};

// Board choices come from the registry, so new boards appear here automatically.
const boardIdsProperty = {
  name: 'Boards',
  description: 'Leave empty to show for every board.',
  dataType: 'array',
  of: {
    dataType: 'string',
    enumValues: Object.fromEntries(boards.map((b) => [b.id, b.name])),
  },
} as const;

const publishedProperty = {
  name: 'Published',
  description: 'Only published items are visible on the site.',
  dataType: 'boolean',
  defaultValue: false,
} as const;

const orderProperty = {
  name: 'Order',
  description: 'Lower numbers are listed first.',
  dataType: 'number',
  defaultValue: 100,
} as const;

export const examplesCollection = buildCollection<Example>({
  id: COLLECTIONS.examples,
  path: COLLECTIONS.examples,
  name: 'Examples',
  singularName: 'Example',
  group: 'Content',
  icon: 'Code',
  permissions: editorCanWrite,
  properties: {
    title: { name: 'Title', dataType: 'string', validation: { required: true } },
    description: { name: 'Description', dataType: 'string', multiline: true },
    boardIds: boardIdsProperty,
    files: {
      name: 'Files',
      dataType: 'array',
      validation: { required: true, min: 1, max: PROJECT_LIMITS.maxFiles },
      of: {
        dataType: 'map',
        properties: {
          path: {
            name: 'File name',
            dataType: 'string',
            description: `Allowed types: ${PROJECT_LIMITS.allowedExtensions.join(' ')}`,
            validation: { required: true },
          },
          content: { name: 'Code', dataType: 'string', multiline: true },
        },
      },
    },
    published: publishedProperty,
    order: orderProperty,
  },
});

export const lessonsCollection = buildCollection<Lesson>({
  id: COLLECTIONS.lessons,
  path: COLLECTIONS.lessons,
  name: 'Lessons',
  singularName: 'Lesson',
  group: 'Content',
  icon: 'School',
  permissions: editorCanWrite,
  properties: {
    title: { name: 'Title', dataType: 'string', validation: { required: true } },
    slug: {
      name: 'URL slug',
      dataType: 'string',
      description: 'Lowercase words joined by dashes, e.g. "first-program".',
      validation: { required: true, matches: /^[a-z0-9]+(-[a-z0-9]+)*$/ },
    },
    body: { name: 'Body', dataType: 'string', markdown: true },
    boardIds: boardIdsProperty,
    published: publishedProperty,
    order: orderProperty,
  },
});

export const pagesCollection = buildCollection<Page>({
  id: COLLECTIONS.pages,
  path: COLLECTIONS.pages,
  name: 'Pages',
  singularName: 'Page',
  group: 'Content',
  icon: 'Article',
  customId: true,
  permissions: editorCanWrite,
  properties: {
    title: { name: 'Title', dataType: 'string', validation: { required: true } },
    body: { name: 'Body', dataType: 'string', markdown: true },
    published: publishedProperty,
  },
});

export const settingsCollection = buildCollection<SiteSettings>({
  id: COLLECTIONS.settings,
  path: COLLECTIONS.settings,
  name: 'Site settings',
  singularName: 'Settings',
  group: 'Site',
  icon: 'Settings',
  customId: { site: 'Site-wide settings' },
  permissions: adminOnly,
  properties: {
    announcement: {
      name: 'Announcement banner',
      dataType: 'string',
      description: 'Shown at the top of every page. Leave empty to hide.',
    },
    maintenanceMode: {
      name: 'Maintenance mode',
      dataType: 'boolean',
      description: 'Shows a maintenance notice and disables compiling.',
    },
  },
});

export const usersCollection = buildCollection<UserProfile>({
  id: COLLECTIONS.users,
  path: COLLECTIONS.users,
  name: 'Users',
  singularName: 'User',
  group: 'Site',
  icon: 'Group',
  // Read-only: profiles are written by users themselves; roles via `pnpm set-role` for now.
  permissions: ({ authController }) => ({
    read: roleOf(authController) === 'admin',
    create: false,
    edit: false,
    delete: false,
  }),
  properties: {
    displayName: { name: 'Name', dataType: 'string' },
    email: { name: 'Email', dataType: 'string' },
    photoURL: { name: 'Photo', dataType: 'string', url: 'image' },
  },
});

export const collections = [
  examplesCollection,
  lessonsCollection,
  pagesCollection,
  settingsCollection,
  usersCollection,
];
