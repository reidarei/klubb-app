'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import SetVinnerModal from '@/components/SetVinnerModal'

type Mal = {
  id: string
  navn: string
}

type Vinner = {
  id: string
  begrunnelse: string | null
  profil_id: string | null
  profiles: { navn: string } | null
  arrangement_id: string | null
  arrangementer: { tittel: string } | null
}

export default function KaaringKort({
  mal,
  aar,
  vinner,
  erAdmin,
  medlemmer,
  arrangementer,
}: {
  mal: Mal
  aar: number
  vinner?: Vinner
  erAdmin: boolean
  medlemmer: { id: string; navn: string }[]
  arrangementer: { id: string; tittel: string; start_tidspunkt: string }[]
}) {
  const [modalApen, setModalApen] = useState(false)

  return (
    <>
      <Card>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="font-semibold text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
              {mal.navn}
            </p>
            {vinner ? (
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
                  {vinner.profil_id ? vinner.profiles?.navn : vinner.arrangementer?.tittel}
                </p>
                {vinner.begrunnelse && (
                  <p className="text-xs mt-0.5 italic" style={{ color: 'var(--text-secondary)' }}>
                    «{vinner.begrunnelse}»
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Ingen vinner satt
              </p>
            )}
          </div>

          {erAdmin && (
            <Button
              variant="secondary"
              onClick={() => setModalApen(true)}
              className="!text-xs !px-2 !py-1"
            >
              {vinner ? 'Endre' : 'Sett'}
            </Button>
          )}
        </div>
      </Card>

      <SetVinnerModal
        aapen={modalApen}
        setAapen={setModalApen}
        malId={mal.id}
        malNavn={mal.navn}
        aar={aar}
        medlemmer={medlemmer}
        arrangementer={arrangementer}
        eksisterendeVinner={vinner ? {
          profil_id: vinner.profil_id ?? undefined,
          arrangement_id: vinner.arrangement_id ?? undefined,
          begrunnelse: vinner.begrunnelse ?? undefined,
        } : undefined}
      />
    </>
  )
}
