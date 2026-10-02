import { useCallback, useMemo } from 'react';
import {
  AppBar,
  CircularProgressCenter,
  Drawer,
  FireCMS,
  FireCMSi18nProvider,
  ModeControllerProvider,
  NavigationRoutes,
  Scaffold,
  SideDialogs,
  SnackbarProvider,
  useBuildLocalConfigurationPersistence,
  useBuildModeController,
  useBuildNavigationController,
  useValidateAuthenticator,
  type Authenticator,
} from '@firecms/core';
import {
  FirebaseLoginView,
  useFirebaseAuthController,
  useFirebaseStorageSource,
  useFirestoreDelegate,
  type FirebaseSignInProvider,
  type FirebaseUserWrapper,
} from '@firecms/firebase';
import { isRole } from '@codetochip/data';
import {
  initFirebase,
  initFirebaseStorage,
  resolveFirebaseConfig,
  type FirebaseEnv,
} from '@codetochip/data/firebase';
import { collections, type AdminExtra } from './collections.ts';

// Same config resolution as apps/web: no env vars means local emulators.
const firebaseConfig = resolveFirebaseConfig(import.meta.env as FirebaseEnv);
const { app: firebaseApp } = initFirebase(firebaseConfig);
// Connects Storage to the emulator before FireCMS uses it for media uploads.
initFirebaseStorage(firebaseApp, firebaseConfig);

const signInOptions: FirebaseSignInProvider[] = ['google.com', 'password'];

export function App() {
  /** Only editors and admins may open the admin. Firestore rules enforce the same. */
  const authenticator: Authenticator<FirebaseUserWrapper> = useCallback(
    async ({ user, authController }) => {
      const claims = (await user?.firebaseUser?.getIdTokenResult(true))?.claims;
      const role = isRole(claims?.role) ? claims.role : 'student';
      if (role !== 'editor' && role !== 'admin') {
        throw new Error(
          'This account doesn’t have editor access. Ask an admin to give you the editor role.',
        );
      }
      authController.setExtra({ role } satisfies AdminExtra);
      return true;
    },
    [],
  );

  const modeController = useBuildModeController();
  const authController = useFirebaseAuthController<FirebaseUserWrapper, AdminExtra>({
    firebaseApp,
    signInOptions,
  });
  const userConfigPersistence = useBuildLocalConfigurationPersistence();
  const firestoreDelegate = useFirestoreDelegate({ firebaseApp });
  const storageSource = useFirebaseStorageSource({ firebaseApp });

  const { authLoading, canAccessMainView, notAllowedError } = useValidateAuthenticator({
    authController,
    authenticator,
    dataSourceDelegate: firestoreDelegate,
    storageSource,
  });

  const navigationController = useBuildNavigationController({
    disabled: authLoading,
    collections: useMemo(() => collections, []),
    authController,
    dataSourceDelegate: firestoreDelegate,
  });

  return (
    <FireCMSi18nProvider>
      <SnackbarProvider>
        <ModeControllerProvider value={modeController}>
          <FireCMS
            navigationController={navigationController}
            authController={authController}
            userConfigPersistence={userConfigPersistence}
            dataSourceDelegate={firestoreDelegate}
            storageSource={storageSource}
          >
            {({ loading }) => {
              if (loading || authLoading) return <CircularProgressCenter size="large" />;
              if (!canAccessMainView) {
                return (
                  <FirebaseLoginView
                    authController={authController}
                    firebaseApp={firebaseApp}
                    signInOptions={signInOptions}
                    notAllowedError={notAllowedError}
                  />
                );
              }
              return (
                <Scaffold autoOpenDrawer={false}>
                  <AppBar title="CodeToChip Admin" />
                  <Drawer />
                  <NavigationRoutes />
                  <SideDialogs />
                </Scaffold>
              );
            }}
          </FireCMS>
        </ModeControllerProvider>
      </SnackbarProvider>
    </FireCMSi18nProvider>
  );
}
