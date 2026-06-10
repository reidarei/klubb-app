-- To tabeller hadde FK mot arrangementer(id) uten on-delete-regel, noe som
-- blokkerte sletting av arrangementer koblet til kåringer eller
-- arrangøransvar. Vi dropper og gjenoppretter FK-ene med SET NULL slik at
-- slettingen slipper gjennom og historikken blir stående med null.

alter table kaaring_vinnere
  drop constraint if exists kaaring_vinnere_arrangement_id_fkey,
  add  constraint kaaring_vinnere_arrangement_id_fkey
       foreign key (arrangement_id) references arrangementer(id) on delete set null;

alter table arrangoransvar
  drop constraint if exists arrangoransvar_arrangement_id_fkey,
  add  constraint arrangoransvar_arrangement_id_fkey
       foreign key (arrangement_id) references arrangementer(id) on delete set null;
