interface CompanyLogoSlotProps {
  className?: string;
  logoUrl?: string;
}

/** The caller supplies branding for the request's company or its saved document version. */
export function CompanyLogoSlot({ className, logoUrl }: CompanyLogoSlotProps) {
  return (
    <div className={className} aria-hidden="true">
      {logoUrl && <img src={logoUrl} alt="" />}
    </div>
  );
}
