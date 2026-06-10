'use client'

import { formaterDato } from '@/lib/dato'

export default function LocalTid({ iso, formatStr }: { iso: string; formatStr: string }) {
  return <>{formaterDato(iso, formatStr)}</>
}
