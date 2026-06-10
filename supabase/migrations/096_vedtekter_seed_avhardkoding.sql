-- Fixup: fjern klubbnavnet fra vedtekter-seedens default-tekst.
--
-- Bakgrunn: migrasjon 005 sådde 'vedtekter'-raden med teksten
--   '# Vedtekter for Mortensrud Herreklubb\n\n_Ingen vedtekter lagt inn ennå._'
-- Dette hardkoder klubbnavnet i innholdet, noe vi ønsker å unngå.
--
-- VIKTIG: 005 brukte vanlig singlequote-streng, så `\n` lagres som to
-- bokstavelige tegn (`\` + `n`) — IKKE som linjeskift. Verifisert mot prod
-- 2026-06-10. Den ekte vedtekter-raden er for lengst redigert til reelt
-- innhold (1700+ tegn med ekte newlines), så for å unngå å overskrive
-- redigert innhold matcher vi på EKSAKT opprinnelig seed-streng — ikke
-- prefiks. Migrasjonen er da idempotent og no-op i prod (raden er endret).
--
-- Vi rører heller ikke `regler`/`historikk` her — de har ikke klubbnavn
-- i seg, så de er utenfor scope for denne fixupen. (Literal `\n` i de
-- radene er en separat skjønnhetsfeil som tas i eget issue ved behov.)

update public.vedtekter
   set innhold = '# Vedtekter\n\n_Ingen vedtekter lagt inn ennå._'
 where slug = 'vedtekter'
   and innhold = '# Vedtekter for Mortensrud Herreklubb\n\n_Ingen vedtekter lagt inn ennå._';
