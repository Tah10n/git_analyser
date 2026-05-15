type IconProps = {
  className?: string;
};

export const PlayIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M5 3.4v9.2L12 8 5 3.4Z" />
  </svg>
);

export const PauseIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4.2 3.2h2.3v9.6H4.2V3.2Zm5.3 0h2.3v9.6H9.5V3.2Z" />
  </svg>
);

export const PreviousIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4 3.2h1.8v9.6H4V3.2Zm2.5 4.8 5.5-4.5v9L6.5 8Z" />
  </svg>
);

export const NextIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M10.2 3.2H12v9.6h-1.8V3.2ZM4 3.5 9.5 8 4 12.5v-9Z" />
  </svg>
);

export const FolderIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M1.8 4.2c0-.8.5-1.3 1.3-1.3h3.1l1.3 1.4H13c.8 0 1.3.5 1.3 1.3v6.3c0 .8-.5 1.3-1.3 1.3H3.1c-.8 0-1.3-.5-1.3-1.3V4.2Z" />
  </svg>
);

export const FileIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4 1.8h5.4L12.8 5v9.2H4V1.8Zm5 1.3v2.4h2.5L9 3.1Z" />
  </svg>
);

export const BranchMarkIcon = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M7 4v16m0-3h6.3a3.7 3.7 0 0 0 0-7.4H7"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
    <circle cx="7" cy="4" fill="currentColor" r="2.5" />
    <circle cx="7" cy="20" fill="currentColor" r="2.5" />
  </svg>
);
