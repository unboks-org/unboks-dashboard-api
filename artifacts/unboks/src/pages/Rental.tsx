import { DashboardShell } from "@/components/inbox/DashboardShell";
import { AliDossierSettings } from "@/components/settings/rental/AliDossierSettings";
import { RentalControlCenter } from "@/components/settings/rental/RentalControlCenter";
import { useRentalControlCapability } from "@/hooks/use-rental-control-capability";

export default function Rental() {
  const capability = useRentalControlCapability();

  return (
    <DashboardShell
      activeNav="rental"
      pageTitle="Fleet & pricing"
      pageSubtitle="Fleet, rates, quote documents and reservation setup"
      hideRefresh
    >
      <div className="min-h-full bg-[#f5f2ec]">
        <h2 className="sr-only">Rental</h2>
        <div className="mx-auto w-full max-w-[1320px] space-y-5 px-4 py-6 sm:px-6 sm:py-8">
          {capability.isLoading ? (
            <section className="rounded-2xl border border-[#e6e8eb] bg-white p-6 text-sm text-[#5f6368] shadow-sm">
              Loading rental controls…
            </section>
          ) : capability.isUnavailable ? (
            <section className="rounded-2xl border border-[#f2c7c7] bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-[#202124]">
                Rental controls could not be verified
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#5f6368]">
                The workspace check failed. No settings were changed.
              </p>
              <button
                type="button"
                className="mt-4 min-h-10 rounded-xl bg-[#1a73e8] px-4 text-sm font-semibold text-white hover:bg-[#1558b0]"
                onClick={() => void capability.retry()}
              >
                Try again
              </button>
            </section>
          ) : capability.enabled ? (
            <>
              <RentalControlCenter />
              <AliDossierSettings />
            </>
          ) : (
            <section className="rounded-2xl border border-[#f2c7c7] bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-[#202124]">
                Rental controls unavailable
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#5f6368]">
                This workspace is not enabled for rental management. No settings
                were changed.
              </p>
            </section>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
