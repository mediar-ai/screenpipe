import { PrettyLink } from "./pretty-link";

export const FeatureRequestLink: React.FC<{ className?: string }> = ({
  className,
}) => (
  <PrettyLink
    className={className}
    variant="outline"
    href="mailto:louis@screenpi.pe?subject=Screenpipe%20Pipe%20Store%20Feature&body=yo%20louis%2C%0A%0Ai'd%20like%20to%20be%20featured%20in%20the%20Pipe%20Store.%20I've%20got%20an%20awesome%20product%20that%20use%20screenpipe%20and%20would%20get%20some%20more%20users%20by%20being%20listed%20here.%0A%0A%3Cmy%20product%20does%20x%2C%20y%2C%20z%3E%0A%3Cthis%20is%20my%20twitter%20tag%20or%20linkedin%3E%20-%3C%20will%20interact%20with%20your%20post%20for%20maximum%20cross%20marketing%0A%0Alet's%20chat%20about%20how%20we%20can%20collaborate%0A%0Alooking%20forward%20to%20connecting!%0A%0A%3Cps%20book%20call%20here%20https%3A%2F%2Fcal.com%2Flouis030195%2Fscreenpipe%3E"
  >
    <span className="mr-2">want to be featured here? reach out</span>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  </PrettyLink>
);
