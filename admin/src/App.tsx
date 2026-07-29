import { Refine, useIsAuthenticated } from '@refinedev/core';
import { accessControlProvider } from './access-control-provider';
import { authProvider } from './auth-provider';
import { dataProvider } from './data-provider';
import { FeatureFlagsList } from './pages/feature-flags/list';
import { LoginPage } from './pages/login';

function Gate() {
  const { data, isLoading } = useIsAuthenticated();

  if (isLoading) {
    return <p>Loading...</p>;
  }

  return data?.authenticated ? <FeatureFlagsList /> : <LoginPage />;
}

export function App() {
  return (
    <Refine
      dataProvider={dataProvider}
      authProvider={authProvider}
      accessControlProvider={accessControlProvider}
      resources={[{ name: 'feature-flags' }]}
      options={{ disableTelemetry: true }}
    >
      <Gate />
    </Refine>
  );
}
