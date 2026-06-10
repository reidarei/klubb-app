import type { SVGProps } from 'react'

export type IkonNavn =
  | 'calendar' | 'info' | 'trophy' | 'user' | 'plus' | 'mapPin' | 'plane'
  | 'chevron' | 'chevronDown' | 'bell' | 'message' | 'clock' | 'users'
  | 'doc' | 'building' | 'chart' | 'cog' | 'arrowRight' | 'checkmark'
  | 'x' | 'send' | 'list' | 'search' | 'cake' | 'cigar' | 'wine' | 'crown'
  | 'sparkle' | 'diamond' | 'flame' | 'image'

const PATHS: Record<IkonNavn, React.ReactNode> = {
  calendar: <path d="M8 2v3M16 2v3M3 9h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 8v0M11 12h1v5h1" /></>,
  trophy: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM7 4H4v2a3 3 0 003 3M17 4h3v2a3 3 0 01-3 3" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  mapPin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z" /><circle cx="12" cy="10" r="3" /></>,
  plane: <path d="M12 19l9-7-9-7v4L3 12l9 3v4z" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  bell: <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 004 0" />,
  message: <path d="M21 12a8 8 0 01-11 7l-6 2 2-5a8 8 0 1115-4z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M1 21a8 8 0 0116 0M17 4a4 4 0 010 8M23 21a8 8 0 00-6-7" /></>,
  doc: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>,
  building: <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" />,
  chart: <path d="M3 3v18h18M7 14l4-4 4 4 5-5" />,
  cog: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09A1.65 1.65 0 0015 4.6a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.38.25.78.33 1.17" /></>,
  arrowRight: <path d="M5 12h14M13 5l7 7-7 7" />,
  checkmark: <path d="M5 13l4 4L19 7" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  send: <path d="M3 11l18-8-8 18-2-8-8-2z" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" /></>,
  cake: <path d="M4 21v-5a2 2 0 012-2h12a2 2 0 012 2v5M4 21h16M7 14V9a2 2 0 012-2h6a2 2 0 012 2v5M12 3v4" />,
  cigar: <><path d="M2 12l14-3 6 3-6 3L2 12z" /><path d="M16 9v6M4 12h10" /></>,
  wine: <path d="M8 3h8l-1 9a3 3 0 01-6 0L8 3zM12 15v6M8 21h8" />,
  crown: <path d="M3 7l4 5 5-8 5 8 4-5v11H3V7z" />,
  sparkle: <path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />,
  diamond: <path d="M6 3h12l4 6-10 12L2 9l4-6z M2 9h20 M12 3l-2 6 2 12 2-12-2-6z" />,
  flame: <path d="M12 2s4 4 4 8a4 4 0 01-8 0c0-1 1-2 2-2-3 4 1 6 2 6s3-1 3-4c0-3-3-5-3-8z" />,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>,
}

type Props = {
  name: IkonNavn
  size?: number
  color?: string
  strokeWidth?: number
} & Omit<SVGProps<SVGSVGElement>, 'name' | 'color'>

export default function Icon({
  name,
  size = 20,
  color = 'currentColor',
  strokeWidth = 1.5,
  ...rest
}: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
