import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Base({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconChevron = (p: IconProps) => (
  <Base {...p}><polyline points="9 6 15 12 9 18" /></Base>
)

export const IconSquareBrush = (p: IconProps) => (
  <Base {...p}><rect x="5" y="5" width="14" height="14" rx="1.5" /></Base>
)

export const IconCircleBrush = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="7" /></Base>
)

export const IconCave = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 14c-.6-2 .4-4 2-4.3-.4-2 1.2-3.7 3.2-3.2.7-1.6 3-2 4.2-.6 2-.6 3.8 1.1 3.4 3 1.7.3 2.4 2.5 1.2 3.8.9 1.7-.3 3.8-2.2 3.7H7c-2 0-3-1.7-2-2.4Z" />
  </Base>
)

export const IconStairs = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 19v-4h4v-4h4V7h4V4" />
    <path d="M4 19h16" />
  </Base>
)

export const IconRamp = (p: IconProps) => (
  <Base {...p}><path d="M4 19h16" /><path d="M4 19 18 6" /><path d="M4 19V6h6" /></Base>
)

export const IconDroplet = (p: IconProps) => (
  <Base {...p}><path d="M12 3c3 4 6 7.2 6 10.5a6 6 0 1 1-12 0C6 10.2 9 7 12 3Z" /></Base>
)

export const IconEraser = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 17.5 11.5 9a2 2 0 0 1 2.8 0l3.7 3.7a2 2 0 0 1 0 2.8L13.5 20H7Z" />
    <path d="M3 17.5 7 20h3M9.5 11.5l5 5" />
  </Base>
)

export const IconFloor = (p: IconProps) => (
  <Base {...p}><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M4 12h16M12 4v16" opacity={0.4} /></Base>
)

export const IconTag = (p: IconProps) => (
  <Base {...p}>
    <path d="M11 4H5a1 1 0 0 0-1 1v6l9.5 9.5a1.5 1.5 0 0 0 2.1 0l5.4-5.4a1.5 1.5 0 0 0 0-2.1L11 4Z" />
    <circle cx="8.3" cy="8.3" r="1.3" fill="currentColor" stroke="none" />
  </Base>
)

export const IconHash = (p: IconProps) => (
  <Base {...p}><path d="M9 4 7 20M17 4l-2 16M4 9h16M3.5 15h16" /></Base>
)

export const IconCube = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3 20 7.5v9L12 21 4 16.5v-9Z" />
    <path d="M12 3v9M4 7.5l8 4.5 8-4.5M12 21v-9" />
  </Base>
)

export const IconFrame = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
  </Base>
)

export const IconHatch = (p: IconProps) => (
  <Base {...p}>
    <rect x="4" y="4" width="16" height="16" rx="1" opacity={0.5} />
    <path d="M4 16 16 4M4 9 9 4M15 20 20 15M4 20l9-9" />
  </Base>
)

export const IconRotate = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 12a8 8 0 1 0 2.6-5.9" />
    <polyline points="4 4 4 8 8 8" />
  </Base>
)

export const IconMirror = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3v18M6 8l-3 4 3 4M18 8l3 4-3 4" />
  </Base>
)

export const IconTrash = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M7 7l1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13" />
  </Base>
)

export const IconSave = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 4h11l3 3v13H5z" /><path d="M9 4v5h6V4M8 13h8v7H8z" />
  </Base>
)

export const IconFolder = (p: IconProps) => (
  <Base {...p}><path d="M4 7h5l2 2h9v10H4z" /></Base>
)

export const IconImage = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
    <circle cx="9" cy="10" r="1.6" fill="currentColor" stroke="none" />
    <path d="M5 17l4.5-5 3 3.2L17 11l3 4.5" />
  </Base>
)

export const IconPlus = (p: IconProps) => (
  <Base {...p}><path d="M12 5v14M5 12h14" /></Base>
)

export const IconMinus = (p: IconProps) => (
  <Base {...p}><path d="M5 12h14" /></Base>
)

export const IconLayers = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3 21 8l-9 5-9-5Z" />
    <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
  </Base>
)

export const IconCompass = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M14.5 9.5 12 12l-2.5 2.5L12 12l2.5-2.5Z" fill="currentColor" stroke="none" />
  </Base>
)

export const IconStampFloor = (p: IconProps) => (
  <Base {...p}><rect x="4" y="11" width="16" height="9" rx="1" /><path d="M4 11 12 4l8 7" /></Base>
)

export const IconStampObject = (p: IconProps) => (
  <Base {...p}><path d="M7 20V8a5 5 0 0 1 10 0v12" /><path d="M4 20h16" /></Base>
)

export const IconExpand = (p: IconProps) => (
  <Base {...p}><path d="M9 4h11v11" /><path d="M20 4 4 20" /><path d="M4 9V20h11" opacity={0.45} /></Base>
)
