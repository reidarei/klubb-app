// Denne siden ble erstattet av /tidligere som viser full historikk på tvers
// av arrangementer, meldinger og polls. Se issue #176.
import { permanentRedirect } from 'next/navigation'

export default function TidligereArrangementerRedirect() {
  permanentRedirect('/tidligere')
}
