import { useEffect, useState } from "react";

import { DashboardShell } from "@/components/inbox/DashboardShell";
import { AliDossierSettings } from "@/components/settings/rental/AliDossierSettings";
import { RentalControlCenter } from "@/components/settings/rental/RentalControlCenter";
import { useRentalControlCapability } from "@/hooks/use-rental-control-capability";
import { isAliRentalTenant } from "@/lib/tenant-ui";

export default function Rental() {
  const capability = useRentalControlCapability();
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  const available = isAliRentalTenant() && capability.enabled;

  return (
    <DashboardShell
      activeNav="rental"
      pageTitle="Rental"
      pageSubtitle="Manage the fleet, fixed pricing, contract template, payment setup, and quote readiness."
      hideRefresh
    >
      <div className="min-h-full bg-[#f8f9fb]">
        <div className="mx-auto w-full max-w-[1180px] space-y-5 px-4 py-6 sm:px-6 sm:py-8">
          {capability.isLoading ? (
            <section className="rounded-2xl border border-[#e6e8eb] bg-white p-6 text-sm text-[#5f6368] shadow-sm">
              Loading rental controls…
            </section>
          ) : available ? (
            <>
              <RentalControlCenter onDirtyChange={setDirty} />
              <AliDossierSettings />
            </>
          ) : (
            <section className="rounded-2xl border border-[#f2c7c7] bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-[#202124]">Rental controls unavailable</h2>
              <p className="mt-2 text-sm leading-6 text-[#5f6368]">
                This workspace is not enabled for rental management. No settings were changed.
              </p>
            </section>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
