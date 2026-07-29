import { Refine, useIsAuthenticated } from '@refinedev/core';
import { Navigate, Route, HashRouter, Routes } from 'react-router-dom';
import { accessControlProvider } from './access-control-provider';
import { authProvider } from './auth-provider';
import { dataProvider } from './data-provider';
import { Layout } from './layout';
import { FeatureFlagsList } from './pages/feature-flags/list';
import { LoginPage } from './pages/login';
import { SeedersList } from './pages/seeders/list';

function Gate({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useIsAuthenticated();

  if (isLoading) {
    return <p className="p-8 text-neutral-400">Loading...</p>;
  }

  if (!data?.authenticated) {
    return <LoginPage />;
  }

  return <Layout>{children}</Layout>;
}

export function App() {
  return (
    <HashRouter>
      <Refine
        dataProvider={dataProvider}
        authProvider={authProvider}
        accessControlProvider={accessControlProvider}
        resources={[{ name: 'feature-flags' }, { name: 'seeders' }]}
        options={{ disableTelemetry: true }}
      >
        <Routes>
          <Route
            path="/feature-flags"
            element={
              <Gate>
                <FeatureFlagsList />
              </Gate>
            }
          />
          <Route
            path="/seeders"
            element={
              <Gate>
                <SeedersList />
              </Gate>
            }
          />
          <Route path="*" element={<Navigate to="/feature-flags" replace />} />
        </Routes>
      </Refine>
    </HashRouter>
  );
}
