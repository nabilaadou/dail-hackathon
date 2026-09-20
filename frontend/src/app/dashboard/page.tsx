import { CONFIG } from 'src/global-config';

import { CarCaseWorkspace } from 'src/sections/dashboard/car-case-workspace';

// ----------------------------------------------------------------------

export const metadata = { title: `Case workspace | ${CONFIG.appName}` };

export default function Page() {
  return <CarCaseWorkspace />;
}
