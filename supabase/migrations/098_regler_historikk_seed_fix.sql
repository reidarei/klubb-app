-- Fixup: erstatt literal \n-sekvenser i regler- og historikk-seedradene.
--
-- Bakgrunn (issue #302): migrasjon 005 sådde alle tre vedtekter-radene med
-- vanlige singlequote-strenger, der \n ikke tolkes som linjeskift men lagres
-- som to bokstavelige tegn ('\' + 'n'). Vedtekter-raden er allerede rettet
-- til ekte innhold i prod, men regler og historikk har aldri blitt redigert
-- og inneholder fortsatt den originale seed-teksten med literal \n.
--
-- Løsning: exact-match-guard — vi oppdaterer BARE raden hvis innholdet er
-- identisk med det som ble sådd i mig. 005. Dvs. migrasjonen er idempotent
-- og no-op hvis innholdet allerede er redigert.
--
-- Mønster fra mig. 096 (vedtekter-fixup).
-- Tracker: issue #302.

-- regler: seed fra 005 var '# Regler\n\n_Ingen regler lagt inn ennå._'
-- med literal backslash-n (to tegn, ikke linjeskift).
-- Vi bytter til E-streng (Postgres escape-streng) som tolker \n riktig.
update public.vedtekter
   set innhold = E'# Regler\n\n_Ingen regler lagt inn ennå._'
 where slug = 'regler'
   and innhold = '# Regler\n\n_Ingen regler lagt inn ennå._';

-- historikk: seed fra 005 var '# Historikk\n\n_Ingen historikk lagt inn ennå._'
update public.vedtekter
   set innhold = E'# Historikk\n\n_Ingen historikk lagt inn ennå._'
 where slug = 'historikk'
   and innhold = '# Historikk\n\n_Ingen historikk lagt inn ennå._';
