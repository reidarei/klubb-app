-- Fix Øyvind's birthday arrangement title to past tense
UPDATE arrangementer
SET tittel = 'Øyvind fylte 43 år'
WHERE tittel = 'Øyvind fyller 43 år'
AND start_tidspunkt < now();
