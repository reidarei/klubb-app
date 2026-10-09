// Register over alle event-navn som går til logg.warn()/logg.feil() (server) og
// sendFeilBeacon()/meldKlientfeil() (klient). Ren type — null runtime-kostnad.
// Et event-navn som ikke står her gir typefeil ved kallstedet, og
// __tests__/logg-hendelser.test.ts feiler på oppføringer ingen kode bruker lenger.
// Beskrivelsen vises ved hover på event-strengen i editoren. (#849)
//
// Navnerom er dot-separert: <område>.<ting>.<utfall>. Prefiks «klient.» = sendt
// fra nettleseren via /api/logg-feil. «warn:» i beskrivelsen = logg.warn()
// (kun stdout), ellers logg.feil() (stdout + feil_logg + Sentry).

export interface LoggHendelser {
  /** Resend API-feil i lib/epost.ts */
  'varsel.epost.feilet': true
  /** url som verken er absolutt eller starter med «/» (#507) */
  'varsel.url.relativ': true
  /** url pekte ut av appen (eller var malformert); push fikk «/varsler/{id}» når varsel-raden finnes, ellers «/» — aldri stien fra URL-en (#687) */
  'varsel.url.fremmed': true
  /** web-push-feil i lib/push.ts */
  'varsel.push.feilet': true
  /** VAPID-oppsettet i lib/push.ts feilet; push hoppes over i stedet for å kaste midt i sendVarsel-løkka (#851) */
  'varsel.push.oppsett.feilet': true
  /** R2-opplasting feiler */
  'bilde.opplast.feilet': true
  /** video-upload feiler */
  'video.opplast.feilet': true
  /** ukjent tema-verdi */
  'tema.ugyldig': true
  /** sendChatVarsler() kastet uventet fra sendVarslerEtterPost (chat.ts try/catch), meldingen er alt lagret (#612) */
  'chat.varsler.feilet': true
  /** varsler etter kåringspoll-hendelse feiler */
  'kaaringspoll.varsler.feilet': true
  /** enkelt-oppgave i påminnelses-cron feiler */
  'cron.paaminne.feilet': true
  /** insert-feil eller uventet exception */
  'bursdagsgratulasjon.feilet': true
  /** web-vitals-rad feiler i DB */
  'vitals.insert.feilet': true
  /** GitHub Issue-oppretting feiler */
  'bli-utvikler.issue.feilet': true
  /** Anthropic dato-forslag feiler (auth/transient) */
  'ai.datoforslag.feilet': true
  /** tell_aktivitet-RPC feiler i /api/aktivitet */
  'aktivitet.tell.feilet': true
  /** arrangement/melding/poll-spørring feiler på /tidligere (#492) */
  'tidligere.hent.feilet': true
  /** tell_poll_stemmer-RPC feiler i lib/queries/poll.ts (#492) */
  'poll.aggregat.feilet': true
  /** varsel_innstillinger-oppslag (aktiv/test-modus) feiler (#503) */
  'varsel.innstilling.feilet': true
  /** arrangementer-oppslag for fortids-sperren feiler (#503) */
  'varsel.fortidssperre.feilet': true
  /** mottaker-oppslag (profiles) feiler i lib/varsler.ts (#503) */
  'varsel.mottakere.feilet': true
  /** eksplisitt mottakerliste ga 0 aktive treff utenfor testmodus (#503) */
  'varsel.mottakere.tomme': true
  /** dedup-select mot varsel_logg feiler, sender likevel (#503) */
  'varsel.dedup.feilet': true
  /** varsel_preferanser/push_subscriptions-oppslag feiler (#503) */
  'varsel.preferanser.feilet': true
  /** insert i varsel_logg feiler for én mottaker, sender likevel (#503) */
  'varsel.logg.insert.feilet': true
  /** arrangement/poll-oppslag for @-mention-tittel feiler, sender likevel (#503) */
  'varsel.scope.feilet': true
  /** varsel etter pass-tilgang-hendelse feiler i lib/actions/pass.ts (#503) */
  'pass.varsler.feilet': true
  /** stemple_pass_varslet()-RPC feiler etter vellykket varsel (#504) */
  'pass.stempel.feilet': true
  /** alarm-varsel i sjekk-klientfeil-cronet feiler, retention kjører videre (#503) */
  'cron.klientfeil.varsel.feilet': true
  /** warn: ingen har faar_feilvarsler, døgnalarmen fyrer aldri (#582) */
  'cron.klientfeil.mottakere.tomme': true
  /** warn: ingen har faar_issue_varsler, innspill når bare innsenderen (#582) */
  'github.webhook.mottakere.tomme': true
  /** arrangementer-oppslag for en påminnelsesdag feiler (#504) */
  'cron.paaminne.hentForDag.feilet': true
  /** arrangoransvar-oppslag for dagens purringer feiler (#504) */
  'cron.paaminne.hentArrangorPurringer.feilet': true
  /** «åpne kåringspoller»-spørringen feiler (#495/#504) */
  'cron.paaminne.kaaring.fersk.feilet': true
  /** «uvarslede avsluttede kåringspoller»-spørringen feiler (#495/#504) */
  'cron.paaminne.kaaring.retry.feilet': true
  /** mottaker-oppslag for kåringsvarsel feiler, DEN ufravikelige (#495/#504) */
  'cron.paaminne.kaaring.profiler.feilet': true
  /** behandleKaaringspoller() kastet, fanget i kjorPaaminnelser (#504) */
  'cron.paaminne.kaaring.feilet': true
  /** avslutt_kaaringspoll-RPC-en feilet for én poll (#504) */
  'cron.paaminne.kaaring.rpc.feilet': true
  /** avslutt_kaaringspoll returnerte ingen rad (#504) */
  'cron.paaminne.kaaring.tom_rpc': true
  /** warn: fersk poll ble ikke lukket (ikke_moden / kappløp), utsettes til retry (#504) */
  'cron.paaminne.kaaring.fersk_ikke_lukket': true
  /** profiler-med-fødselsdato-oppslag feiler (#504) */
  'bursdagsgratulasjon.profiler.feilet': true
  /** avsender-admin-oppslag feiler (#504) */
  'bursdagsgratulasjon.avsendere.feilet': true
  /** sendChatVarsler for gratulasjonen kastet; retryes neste slot via dedup_noekkel (#642) */
  'bursdagsgratulasjon.chatvarsel.feilet': true
  /** profiler-oppslag (alle aktive) feiler i det egne bursdagsvarselet, sendes ikke til noen (#638) */
  'bursdagsvarsel.profiler.feilet': true
  /** sendVarsel for bursdagsvarselet kastet for ett bursdagsbarn; retryes neste slot via dedup_noekkel, neste bursdagsbarn er upåvirket (#638) */
  'bursdagsvarsel.feilet': true
  /** kjorPaaminnelser() kastet ut av handleren; de andre cron-jobbene kjørte likevel (#638-review) */
  'cron.paaminne.jobb.feilet': true
  /** kjorBursdagsgratulasjon() kastet; bursdagsvarselet kjørte likevel samme slot (#638-review) */
  'cron.bursdagsgratulasjon.jobb.feilet': true
  /** kjorBursdagsvarsel() kastet ut av sin egen try/catch (#638-review) */
  'cron.bursdagsvarsel.jobb.feilet': true
  /** feil_logg-inserten fra logg.feil() selv feilet/timet ut (#496) */
  'logg.feillogg.insert.feilet': true
  /** navn-/tur-berikelse for pass-varsel feiler etter committet skriving, sender likevel (pulje A) */
  'pass.varsel.oppslag.feilet': true
  /** gammel markedsverdi-oppslag feiler før oppdatering/sletting (pulje A) */
  'fond.eiendom.oppslag.feilet': true
  /** gammel verdi-oppslag feiler før oppdatering/sletting (pulje A) */
  'fond.verdipapir.oppslag.feilet': true
  /** gammel kontantsaldo-oppslag feiler før oppdatering (pulje A) */
  'fond.kontant.oppslag.feilet': true
  /** profil-oppslag for visningsnavn-matching i fond-oppgjør feiler (pulje A) */
  'fond.oppgjor.profiler.feilet': true
  /** innskudd-rader-oppslag i fond-oppgjør feiler (pulje A) */
  'fond.oppgjor.innskudd.feilet': true
  /** kontantsaldo-oppslag for diff-visning i fond-oppgjør feiler (pulje A) */
  'fond.oppgjor.saldo.feilet': true
  /** arrangement_id-oppslag for revalidatePath feiler etter committet album-mutasjon (pulje A) */
  'album.revalidering.oppslag.feilet': true
  /** bilder-oppslag for R2-opprydding feiler før album slettes (pulje A) */
  'album.slett.bilder_oppslag.feilet': true
  /** bilde_url-oppslag for R2-opprydding feiler før arrangement slettes (pulje A) */
  'arrangement.slett.bilde_oppslag.feilet': true
  /** koblet kåringspoll-oppslag feiler på arrangementsiden, siden rendres uten lenken (pulje B) */
  'arrangement.kobletPoll.oppslag.feilet': true
  /** egen rolle-oppslag feiler på /tidligere, faller tilbake til «ikke admin» (pulje B) */
  'tidligere.minProfil.oppslag.feilet': true
  /** @mention-profiler-oppslag feiler på albumsiden (pulje C) */
  'album.profiler.oppslag.feilet': true
  /** forhåndsvalgt dropdown-verdi feiler på rediger-siden (pulje C) */
  'arrangement.rediger.gjeldendeAnsvar.oppslag.feilet': true
  /** innsender-navn-oppslag feiler på innspill-siden (pulje C) */
  'innspill.profiler.oppslag.feilet': true
  /** kandidat-navn/bilde-oppslag feiler på tiebreak-siden (pulje C) */
  'tiebreak.profiler.oppslag.feilet': true
  /** GS-confirm-dialog-oppslag feiler på medlem-rediger-siden (pulje C) */
  'medlem.rediger.generalsekretaer.oppslag.feilet': true
  /** innsender-navn-oppslag feiler ved innspill-opprettelse (pulje C) */
  'bli-utvikler.profil.oppslag.feilet': true
  /** admin-mottaker-oppslag feiler i sjekk-klientfeil-cronet, alarm uteblir (pulje C) */
  'cron.klientfeil.mottakere.feilet': true
  /** admin-mottaker-oppslag feiler i GitHub-webhooken, 500 så GitHub retryer (pulje C) */
  'github.webhook.mottakere.feilet': true
  /** varsel_logg-oppslag feiler i admin-API-et; klienten får generisk 500 (pulje C-review) */
  'admin.varsel_logg.hent.feilet': true
  /** chat-meldingshenting feiler i nettleseren (pulje C-review) */
  'klient.chat.meldinger.feilet': true
  /** reaksjonshenting feiler i nettleseren (pulje C-review) */
  'klient.chat.reaksjoner.feilet': true
  /** tillatDuplikat: false uten arrangementId/pollId/dedupNoekkel i lib/varsler.ts — ingen nøkkel å deduplisere på, sjekken under er en no-op (#518) */
  'varsel.dedup.ingen_noekkel': true
  /** samtale_chat-oppdateringen til lest = true feiler ved sidelast, siden rendres videre (#539) */
  'samtaler.marker_lest.oppdatering.feilet': true
  /** markerSamtaleLest() kastet uventet fra /samtaler/[id] (#539) */
  'samtaler.marker_lest.feilet': true
  /** markerChatSett() kastet uventet fra /chat (startes tidlig, awaites før svar — var fire-and-forget og ble kuttet av Vercel) */
  'ulest.marker_chat_sett.feilet': true
  /** en <script>/<link> lastet ikke i nettleseren: appen mangler kode (#575) */
  'klient.ressurs.feilet': true
  /** warn: et <img> lastet ikke. Kosmetisk og oftest transient på mobil (#603) */
  'klient.bilde.feilet': true
  /** sendPush traff PUSH_TIMEOUT_MS-deadline (Promise.race), svelges som andre push-feil (#612) */
  'varsel.push.timeout': true
  /** @-mention-benet i sendChatVarsler kastet; nevnte legges tilbake i broadcast (#612) */
  'chat.varsler.mention.feilet': true
  /** broadcast-benet i sendChatVarsler kastet, mention-benet er upåvirket (#612) */
  'chat.varsler.broadcast.feilet': true
  /** warn: sendChatVarsler brukte over CHAT_FANOUT_TREG_MS på mottaker-oppslag + begge sendVarsel-kall (#612) */
  'varsel.chat.fanout.treg': true
  /** warn: e-postkanalen droppet for et chat-varsel, døgnforbruket er over EPOST_DOEGNBUDSJETT_CHAT. Push+in-app gikk (#612-review) */
  'varsel.epost.budsjett.chat_hoppet': true
  /** tellingen av døgnforbruk feilet; vakten feiler ÅPENT og sender e-post som normalt (#612-review) */
  'varsel.epost.budsjett.feilet': true
  /** upserten i /api/varsel-preferanser feiler; medlemmets kanal-/nivåvalg ble ikke lagret (#614-review) */
  'varsel.preferanser.lagring.feilet': true
  /** klienten fikk ikke lagret kanal-/nivåvalget på /profil (nettverk eller 500 fra ruta) (#614-review) */
  'klient.varsel_preferanser.feilet': true
  /** warn: SERVICE WORKER teller hvert trykk på et push-varsel (#676). Bærer klikk_id (#688, korrelasjons-ID generert i notificationclick — binder raden til den påfølgende push.klikk.navigert/push.klikk.innlogging), maal, hadde_maal, antall_klienter, synlig_klient og handling (focus/openWindow) — rettet i #681 etter at ingen av feltene sto i whitelisten og radene kom inn tomme. Ikke en feil — halvparten av et regnskap. */
  'push.klikk': true
  /** warn: KLIENTEN teller hver gang et push-klikk faktisk FORSØKER en navigasjon (#676). Bærer kilde (broadcast/cache/kanal/login — sistnevnte fra #688), allerede_paa_maal, synlighet, klikk_id og forsok (hvilket navigasjonsforsøk raden gjelder, #688), og maal (sti-en vi navigerer TIL, #626). `url` på raden settes automatisk av sendFeilBeacon til window.location.href — det er AVREISESIDEN, ikke målet; en tidligere lesning av denne raden forvekslet de to (#626, tabellen i issue-kommentaren 2026-09-19 var feiltolket telemetri, rettet 2026-10-01). Differansen mot push.klikk ER tapet; uten begge tallene er en mislykket overlevering usynlig. */
  'push.klikk.navigert': true
  /** warn: KLIENTEN bekrefter at en navigasjon fra en tidligere side faktisk landet på målet (#626). Bærer klikk_id, kilde, forsok og maal. push.klikk minus (push.klikk.landet + push.klikk.navigert med allerede_paa_maal: true) = det reelle tapet. */
  'push.klikk.landet': true
  /** warn: push-klikk-URL-en lå lagret, men var eldre enn vinduet da klienten leste den (#626) */
  'klient.pushklikk.foreldet': true
  /** navigator.serviceWorker.register('/sw.js') avviste; push og push-klikk-navigasjon er dødt på den enheten (#626-review) */
  'klient.sw.registrering.feilet': true
  /** warn: sjekkPendingNav() avviste (typisk serviceWorker.ready i fallback-stien); push-klikk-overleveringen ble ikke lest denne runden (#626-review) */
  'klient.sw.pendingnav.feilet': true
  /** warn: klienten bar et push-klikk-mål GJENNOM /login (#688) — sesjonen var utløpt da varselet ble trykket, brukeren logget inn, og målet ble bevart i stedet for å falle til agendaen. Bærer klikk_id og maal (den lokale stien). */
  'push.klikk.innlogging': true
  /** warn: push-klikk-målet ble forsøkt PUSH_KLIKK_MAKS_FORSOK ganger uten at klienten landet der — oppføringen forkastes for å bryte en potensiell løkke (#688). Bærer klikk_id, maal og forsok. */
  'klient.pushklikk.oppgitt': true
  /** insert i innspill_kobling feiler etter opprettet issue, markøren i body dekker fallback (#632) */
  'bli-utvikler.kobling.feilet': true
  /** innspill_kobling-oppslag feiler; faller tilbake til body-markøren (#632) */
  'github.webhook.kobling.oppslag.feilet': true
  /** warn: DB-koblingen manglet, body-markøren reddet varselet (issue fra før migrasjon 136) (#632) */
  'github.webhook.kobling.kun_body': true
  /** verken DB-rad eller body-markør funnet for et issue fra appen; varselet kan ikke sendes (#632) */
  'github.webhook.kobling.tapt': true
  /** innspill_kobling-batchoppslag feiler på /innspill, faller tilbake til body-parsing (#632) */
  'innspill.koblinger.oppslag.feilet': true
  /** FEIL: brukerinnspill lukket som gjennomført uten merket endringslogg-oppføring. Et innspill skal leveres og kommenteres, eller avslås — aldri noe midt imellom, så dette er kontraktbrudd, ikke en normaltilstand. Fyrer IKKE på not_planned/duplicate (legitime utfall); bærer `versjon` så «glemt merkelapp» kan skilles fra «lukket før deploy» (#633) */
  'github.webhook.innspill.uten_endringslogg': true
  /** feil kastet i server component / action / route handler, fanget av onRequestError. Bærer `digest` (koblingen til raden app/error.tsx skriver fra klienten) og en MASKERT melding — eneste sted vi persisterer meldingstekst, se loggRenderFeil() (#631) */
  'server.render.feilet': true
  /** warn: render-feilen var en død sesjon (PGRST301 / AUTH_INGEN_SESJON), ikke en programfeil. Egen event så den ikke drukner i server.render.feilet og ikke vekker døgnalarmen (#631) */
  'server.render.sesjon_utloept': true
  /** warn (stdout only): loggRenderFeil() eller den dynamiske importen av lib/logg kastet inne i onRequestError. Siste skanse — vi står i Next sin feilhåndtering, så en throw her ville maskert den ekte feilen (#631) */
  'server.render.logging.feilet': true
  /** VELLYKKET generering: bytes, mime_type og modell fra Vertex-svaret. Ren observability på warn-kanalen (eneste ikke-Sentry stdout-kanal) — det man trenger å se ved «first light» (#641) */
  'bursdagsbilde.generering.levert': true
  /** Vertex-, R2- eller DB-oppdaterings-steget i genererBursdagsbilde() feilet; fingerprint = feilklasse ('auth'/'kvote'/'ugyldig'/'blokkert'/'transient'/'r2'/'db-update') (#641) */
  'bursdagsbilde.generering.feilet': true
  /** fail-closed mottakerspørring (aktive profiler m/ fødselsdato) feiler i cron-ruta; kastes videre, IKKE tolket som «ingen har bursdag» (#641) */
  'bursdagsbilde.profiler.feilet': true
  /** krev_bursdagsbilde()-RPC-en feiler (ikke 0-rader, som er normalt — en faktisk spørringsfeil) (#641) */
  'bursdagsbilde.claim.feilet': true
  /** R2-sletting feiler: enten det GAMLE bildet ved erstatning (raden peker alt på det nye), opprydding av et ferskt objekt etter feilet DB-oppdatering (fingerprint 'opprydding'), eller admin-slettingen der R2-objektet ER borte men raden ikke ble nullet (fingerprint 'db-update-etter-r2' — 'sti' i konteksten er det som gjør manuell opprydding mulig) (#641) */
  'bursdagsbilde.slett.feilet': true
  /** profilbildet kunne ikke hentes/valideres server-side (HTTP-feil, ugyldig MIME, for stort) før noe Vertex-kall i det hele tatt ble forsøkt (#641) */
  'bursdagsbilde.input.avvist': true
  /** hoved- eller nødpasset i bursdagsbilde-cronet kastet ut av sin egen try/catch; det andre passet kjørte likevel (#641) */
  'cron.bursdagsbilde.jobb.feilet': true
  /** warn: scrubKontekst() droppet minst én nøkkel fra en klient-innsendt kontekst. Bærer count, sample (kommaseparerte nøkkelnavn, kappet i antall og lengde, og kun de som har form som en identifikator fra vår egen kode), ugyldige (antallet som ikke hadde den formen — nøklene er klient-kontrollerte, så formen er PII-vakten) og fingerprint = klient-eventet som mistet felter (ikke `event`: den nøkkelen ville overskrevet event-navnet i stdout-linja). Belte-og-sele mot __tests__/logg-kontekst-dekning.test.ts: fanger en gammel cachet klient-bundle som sender et felt vakten aldri så (#681) */
  'logg-feil.kontekst.strippet': true
  /** upsert i posisjon_deling feiler; mannen får «klarte ikke lagre», ingen prikk settes på kartet (#693/#695) */
  'posisjon.deling.feilet': true
  /** insert av et nytt sporpunkt feiler etter at delingen er lagret (#695) */
  'posisjon.punkt.feilet': true
  /** oppdatering av tidsstempel på et eksisterende punkt feiler (mannen står stille) (#695) */
  'posisjon.punkt.oppdatering.feilet': true
  /** warn: oppslag av forrige punkt feiler; vi legger inn et nytt punkt i stedet for å nekte deling (#695) */
  'posisjon.siste_punkt.feilet': true
  /** sletting av eget spor ved «slutt å dele» feiler; delingen står fortsatt på (#695) */
  'posisjon.punkt.slett.feilet': true
  /** sletting av egen delingsrad feiler; brukeren får beskjed om å prøve igjen (#693) */
  'posisjon.stopp.feilet': true
  /** warn: oppslaget av «hvilket arrangement pågår nå» feiler i den FAIL-OPEN varianten (finnPaagaaendeArrangement); posisjonen lagres videre, bare som et løst punkt uten spor-tilhørighet. Den STRENGE varianten kaster i stedet, og feilen dukker da opp som kartmodus.oppslag.feilet (#695/#723/#780) */
  'posisjon.paagaaende.feilet': true
  /** warn: navneoppslag for pling-teksten feiler; varselet sendes med «Noen» som avsender (#695) */
  'posisjon.pling.avsender.feilet': true
  /** opprydding av utgåtte posisjonsspor feiler i påminnelses-cronet; de andre jobbene kjører videre (#695) */
  'cron.posisjon.rydd.feilet': true
  /** ryddPosisjonsspor() kastet ut av sin egen try/catch; påminnelsene kjørte likevel (#695) */
  'cron.posisjon.jobb.feilet': true
  /** insert av en kartmarkering feiler; mannen får «klarte ikke lagre», ingen nål settes (#697) */
  'kart.markering.feilet': true
  /** sletting av en kartmarkering feiler (spørringsfeil, ikke RLS-avvisning — den gir 0 rader, ikke error) (#697) */
  'kart.markering.slett.feilet': true
  /** warn: klubbchat-meldingene kunne ikke hentes til kartets chat-panel; kartet rendres videre med tomt panel (#709) */
  'kart.chat.hent.feilet': true
  /** warn: profil-oppslaget for chat-panelet feilet; navn og avatarer mangler i panelet (#709) */
  'kart.chat.profiler.feilet': true
  /** warn: nettleseren nektet posisjon (avslått tillatelse, timeout eller ingen fix). Ikke en programfeil — men uten den vet vi ikke om iOS-PWA-en glemmer tillatelsen mellom økter, som er det åpne spørsmålet i #693 */
  'klient.posisjon.nektet': true
  /** warn: timeplan-postene for det aktuelle arrangementet kunne ikke hentes; panelet får en egen, synlig feiltilstand — ALDRI en tom liste (#716) */
  'kart.timeplan.hent.feilet': true
  /** insert av en timeplan-post feiler (arrangement-oppslag eller selve inserten); mannen får «klarte ikke lagre», teksten legges tilbake i feltet (#716) */
  'kart.timeplan.opprett.feilet': true
  /** warn: inserten fikk 23503 på arrangement_id, altså ble turen slettet mellom vakten og inserten (geokodingen kan ligge inntil 5 s imellom). Normal samtidighet, ikke serverfeil — mannen får samme «finnes ikke lenger» som vakten gir */
  'kart.timeplan.opprett.arrangement_borte': true
  /** «Prøv igjen» traff 23505 (raden er lagret), men den lagrede raden kunne ikke leses tilbake; posten svares ut uten sted framfor med et punkt vi ikke har dekning for */
  'kart.timeplan.opprett.retry_les_feilet': true
  /** warn: inserten gikk fint, men PostgREST ga ingen rad tilbake; svaret faller tilbake på verdiene vi selv skrev. Bærer sample = postens id */
  'kart.timeplan.opprett.uten_kvittering': true
  /** sletting av en timeplan-post feiler (spørringsfeil, ikke RLS-avvisning — den gir 0 rader, ikke error) (#716) */
  'kart.timeplan.slett.feilet': true
  /** warn: et medlem slo reisemodus PÅ (for seg selv, på denne enheten). Bærer arrangement_id. Ikke en feil — halvparten av produktsignalet arkitekturstyret ba om i #723 */
  'reisemodus.paa': true
  /** feil: serverskriving av tema-valget feilet. Valget ligger allerede i localStorage, så brukeren merker ingenting — det følger bare ikke med til neste enhet (#742) */
  'tema.lagre.feilet': true
  /** warn: et medlem slo reisemodus AV for turen. Bærer arrangement_id. DEN andre halvparten: slår 14 av 18 den av dag én, er funksjonen feil, og da må tallet finnes (#723) */
  'reisemodus.av': true
  /** warn: et medlem slo møtemodus PÅ (for seg selv, på denne enheten). Bærer arrangement_id. Samme signal som reisemodus.paa, egen møte-variant (#780) */
  'moetemodus.paa': true
  /** warn: et medlem slo møtemodus AV for møtet. Bærer arrangement_id. Samme signal som reisemodus.av, egen møte-variant (#780) */
  'moetemodus.av': true
  /** arrangement- eller flagg-oppslaget bak reisemodus/møtemodus feiler; modusen faller til AV (fail-open mot VANLIG APP — aldri til fullskjermkart ved en feiltakelse). hentKartmodus() bruker de strenge helper-variantene nettopp for at en DB-feil ikke skal se ut som «ingen tur/møte» eller «kill-switch av» (#723, navnet flyttet fra reisemodus.oppslag.feilet da resolveren ble felles for begge moduser i #780) */
  'kartmodus.oppslag.feilet': true
  /** warn: oppslaget i kart_symbol_tilpasning feilet; kartet og varselet bruker registerets standardnavn og -emoji (/innstillinger/kart) */
  'kart.symbol.tilpasning.feilet': true
  /** warn: oppslaget i klubb_info feilet; Klubb-siden og agendaen bruker standardverdiene fra lib/klubb-config.ts (/innstillinger/om-klubben) */
  'klubb.info.feilet': true
  /** warn: erGyldigSymbol() koerserte et symbol utenfor registeret til STANDARD_SYMBOL. Migrasjon 152 (#767) bytter constrainten fra verdiliste til format-check, så en slik verdi ikke lenger nødvendigvis feiler i databasen — dette er signalet som erstatter den tapte 23514. Bærer sample = den avviste verdien (klient-kontrollert, men et symbol-navn, ikke fritekst) */
  'kart.symbol.ukjent': true
  /** warn: interaktivt stedssøk (sokSted-actionen) traff Nominatims GEOKODING_TIMEOUT_MS. Søketeksten logges ALDRI (#757) */
  'kart.sok.tidsavbrudd': true
  /** sokSted()-actionen AVVISTE i nettleseren (utløpt sesjon, nettverksbrudd); mannen får «Søket svarer ikke», knappen låses opp. Bærer kun feilmeldingen, aldri søketeksten (#757-review) */
  'klient.kart.sok.feilet': true
  /** naermestePub()-actionen AVVISTE i nettleseren (utløpt sesjon, nettverksbrudd). Bærer kun feilmeldingen, aldri koordinater (#727) */
  'klient.kart.pub.feilet': true
  /** feil: interaktivt stedssøk feilet (ikke-OK status, nettverksfeil, uventet svarformat). Søketeksten logges ALDRI (#757) */
  'kart.sok.feilet': true
  /** warn: «Nærmeste pub» (naermestePub-actionen) traff GEOKODING_TIMEOUT_MS mot Overpass. Koordinater logges ALDRI (#727) */
  'kart.pub.tidsavbrudd': true
  /** feil: «Nærmeste pub» feilet (ikke-OK status, nettverksfeil, uventet svarformat). Koordinater logges ALDRI (#727) */
  'kart.pub.feilet': true
  /** koble() feiler i opprettArrangement etter at arrangementet er committet; loggføres og opprettelsen fortsetter (#760) */
  'arrangement.koble.feilet': true
  /** navn/visningsnavn-oppdateringen feiler etter at auth-brukeren alt er opprettet; admin får passordet uansett (#760) */
  'admin.opprett_medlem.profil.feilet': true
  /** upsert av push-abonnement feiler i /api/push/subscribe (#760) */
  'push.abonnement.lagring.feilet': true
  /** sletting av push-abonnement feiler i /api/push/subscribe (#760) */
  'push.abonnement.sletting.feilet': true
  /** retention-slettingen i feil_logg feiler; cronet svarer 500 med slettetGamle: null (#760) */
  'cron.klientfeil.retention.feilet': true
  /** kompenserende poll-sletting feiler etter feilet valg-insert; den opprinnelige feilen kastes uansett (#760) */
  'kaaringspoll.opprett.opprydding.feilet': true
  /** kompenserende poll-sletting feiler etter feilet valg-insert; den opprinnelige feilen kastes uansett (#760) */
  'poll.opprett.opprydding.feilet': true
  /** kompenserende melding-sletting feiler etter feilet bilde-insert; den opprinnelige feilen kastes uansett (#760) */
  'melding.opprett.opprydding.feilet': true
  /** warn: oppdatert-bump på album feiler etter vellykket bildeopplasting (#760) */
  'album.bump.feilet': true
  /** warn: automatisk omslagssetting feiler etter vellykket bildeopplasting (#760) */
  'album.auto_omslag.feilet': true
  /** insert i fond_verdi_historikk feiler; selve verdien er allerede lagret (#760) */
  'fond.historikk.feilet': true
  /** feil fanget av app/error.tsx eller app/global-error.tsx (nivå fatal i global-error); bærer digest som kobler til server.render.feilet */
  'klient.render.feilet': true
  /** ufanget window.error i nettleseren, fanget av components/FeilFangst.tsx */
  'klient.window.feilet': true
  /** ufanget unhandledrejection i nettleseren, fanget av components/FeilFangst.tsx */
  'klient.promise.avvist': true
  /** warn: påmeldingsoppslaget bak «Ping en herre» på /kart feilet; kandidatlista blir tom eller ufullstendig, kartet rendres videre */
  'kart.deltakere.paameldinger.feilet': true
  /** warn: GITHUB_WEBHOOK_SECRET mangler; webhooken avviser alle kall med 503 (fail-closed) */
  'github.webhook.ikke-konfigurert': true
  /** arrangørens automatiske «ja» feilet etter at arrangementet er opprettet; arrangementet står */
  'arrangement.rsvp.feilet': true
  /** sendNyttArrangementVarsler() kastet etter committet opprettelse; arrangementet står */
  'arrangement.varsler.feilet': true
  /** sendNyPollVarsler() kastet etter committet opprettelse; pollen står */
  'poll.varsler.feilet': true
  /** varselet om et nytt innlegg kastet etter at innlegget er lagret */
  'melding.varsler.feilet': true
  /** avsendernavnet for et nytt innlegg kunne ikke hentes; varselet bruker fallback-navn */
  'melding.avsendernavn.feilet': true
  /** fond_navn_alias-oppslaget i fond-oppgjør feilet; oppgjøret avbrytes (fail-closed) */
  'fond.oppgjor.alias.feilet': true
  /** skriving av bevegelsesdetaljer feilet etter at totalene er skrevet; admin må hente og skrive på nytt */
  'fond.oppgjor.bevegelser.feilet': true
  /** lukk_kaaringspoll_naa ga en status koden ikke kjenner; varselet hoppes over i stedet for å stemple feil kolonne (#521) */
  'kaaringspoll.ukjent_status': true
  /** avslutt_kaaringspoll ga en status koden ikke kjenner i cron; pollen prøves igjen neste kjøring (#521) */
  'cron.paaminne.kaaring.ukjent_status': true
  /** warn: rolleendring hoppet over fordi gjeldende rolle er generalsekretær eller ikke kunne leses; demotering skjer via fjernGeneralsekretaer() */
  'profil.rolle.hoppet': true
  /** warn: oppslaget av nåværende generalsekretær feilet; RPC-ens egen feilmelding vises i stedet */
  'profil.generalsekretaer.oppslag.feilet': true
  /** oppslaget av kompiser til bursdagsbildet feilet; bildet genereres uten medgjester (#641) */
  'bursdagsbilde.medgjester.oppslag_feilet': true
  /** profilbildet til én medgjest kunne ikke hentes; de andre brukes fortsatt (#641) */
  'bursdagsbilde.medgjest.hent_feilet': true
  /** warn: ulest-oppslaget for chat-prikken feilet; fail-open, ingen prikk */
  'ulest.chat.oppslag.feilet': true
  /** warn: ulest-oppslaget for varsel-prikken feilet; fail-open, ingen prikk */
  'ulest.varsler.oppslag.feilet': true
  /** warn: dev-serveren mot prod-DB blokkerte en utsending; ingen varsel_logg-rad skrives. Bærer sample = varseltypen */
  'varsel.blokkert.lokal': true
  /** warn: varseltypen er slått av i kontrollpanelet; ingen utsending. Bærer sample = varseltypen */
  'varsel.type.deaktivert': true
  /** warn: fortids-sperren stoppet et hendelsesvarsel for et arrangement som har startet. Bærer sample = varseltypen */
  'varsel.hendelse.passert': true
}

/**
 * Varslende kartsymboler logger under sitt eget navnerom: <symbol> er id-en fra
 * registeret (lib/markering-symboler.ts), og navnet settes som loggMottakere /
 * loggVarsel i klubbens datafil (lib/klubb-symboler.ts). (#747, #759, #767)
 * - kart.<symbol>.mottakere.feilet — mottakeroppslaget feilet; markeringen står, varselet uteblir
 * - kart.<symbol>.varsel.feilet — sendVarsel() kastet; markeringen er allerede lagret
 */
export type KartSymbolHendelse = `kart.${string}.mottakere.feilet` | `kart.${string}.varsel.feilet`

export type LoggHendelse = keyof LoggHendelser | KartSymbolHendelse
