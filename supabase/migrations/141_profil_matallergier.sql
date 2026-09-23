-- Matallergier på medlemsprofilen.
--
-- Et vanlig felt på medlemsinformasjonen, på linje med telefon og stikkord:
-- mannen fyller inn selv på /profil/rediger, admin kan fylle inn for andre, og
-- verdien vises på medlemssiden for alle innloggede. Formålet er praktisk —
-- den som bestiller mat til en tur skal kunne se hvem som ikke tåler hva.
--
-- PERSONVERN: dette er den FØRSTE kolonnen i appen som er en helseopplysning,
-- altså en særlig kategori etter GDPR art. 9. Fram til nå kunne
-- docs/personvern-vurdering.md slå fast at appen ikke har art. 9-data; den
-- setningen er oppdatert i samme endring som denne migrasjonen. Grunnlaget er
-- at mannen skriver det inn selv, frivillig, om seg selv — men feltet er
-- synlig for alle innloggede medlemmer, ikke bare for den som bestiller mat.
-- Skal det strammes inn senere, er det en RLS-endring, ikke en UI-endring.
--
-- VIKTIG: `matallergier` legges bevisst IKKE inn i beskytt_profil_kolonner()
-- (migrasjon 105/123). Den triggeren lister kolonner medlemmet IKKE skal røre
-- på sin egen rad (rolle, aktiv, faar_issue_varsler, faar_feilvarsler).
-- Matallergier SKAL være selv-redigerbart, så det hører ikke hjemme der —
-- dette er et valg, ikke en forglemmelse. Samme resonnement som stikkord
-- (migrasjon 138).
--
-- Rad-RLS fra migrasjon 009 gir allerede nøyaktig det vi trenger:
--   select using (aktiv = true)                   → alle medlemmer kan lese
--   update using (id = auth.uid() or er_admin())  → egen rad, eller admin
-- Ingen policy-endring nødvendig.
--
-- Ingen ny GRANT på profiles: en ny kolonne arver tabellens grants
-- (jf. migrasjon 123 § samme note).

alter table public.profiles
  add column matallergier text;

-- Tom streng lagres aldri: normaliseringen i lib/actions/profil.ts skriver
-- null i stedet, slik at «ikke utfylt» har én representasjon i dataene og
-- visningen slipper å skille mellom '' og null. Constrainten håndhever det
-- også for den som skriver via PostgREST utenom appen.
--
-- Grensen speiler MATALLERGIER_MAKS_LENGDE i lib/konstanter.ts — endres den
-- der, må denne constrainten følge etter (samme disiplin som
-- stikkord_gyldig() i migrasjon 138).
alter table public.profiles
  add constraint profiles_matallergier_gyldig
  check (matallergier is null or char_length(btrim(matallergier)) between 1 and 200);
