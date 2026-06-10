export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      album: {
        Row: {
          arrangement_id: string | null
          cover_bilde_id: string | null
          id: string
          oppdatert: string
          opprettet: string
          opprettet_av: string
          tittel: string
        }
        Insert: {
          arrangement_id?: string | null
          cover_bilde_id?: string | null
          id?: string
          oppdatert?: string
          opprettet?: string
          opprettet_av: string
          tittel: string
        }
        Update: {
          arrangement_id?: string | null
          cover_bilde_id?: string | null
          id?: string
          oppdatert?: string
          opprettet?: string
          opprettet_av?: string
          tittel?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_arrangement_id_fkey"
            columns: ["arrangement_id"]
            isOneToOne: false
            referencedRelation: "arrangementer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_cover_fk"
            columns: ["cover_bilde_id"]
            isOneToOne: false
            referencedRelation: "album_bilde"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_opprettet_av_fkey"
            columns: ["opprettet_av"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      album_bilde: {
        Row: {
          album_id: string
          bilde_url: string
          bredde: number | null
          hoyde: number | null
          id: string
          lastet_opp_av: string
          opprettet: string
          rekkefolge: number
          thumb_url: string | null
        }
        Insert: {
          album_id: string
          bilde_url: string
          bredde?: number | null
          hoyde?: number | null
          id?: string
          lastet_opp_av: string
          opprettet?: string
          rekkefolge?: number
          thumb_url?: string | null
        }
        Update: {
          album_id?: string
          bilde_url?: string
          bredde?: number | null
          hoyde?: number | null
          id?: string
          lastet_opp_av?: string
          opprettet?: string
          rekkefolge?: number
          thumb_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "album_bilde_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "album"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_bilde_lastet_opp_av_fkey"
            columns: ["lastet_opp_av"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      arrangement_chat: {
        Row: {
          arrangement_id: string
          bilde_url: string | null
          id: string
          innhold: string | null
          opprettet: string
          profil_id: string
          video_url: string | null
        }
        Insert: {
          arrangement_id: string
          bilde_url?: string | null
          id?: string
          innhold?: string | null
          opprettet?: string
          profil_id: string
          video_url?: string | null
        }
        Update: {
          arrangement_id?: string
          bilde_url?: string | null
          id?: string
          innhold?: string | null
          opprettet?: string
          profil_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arrangement_chat_arrangement_id_fkey"
            columns: ["arrangement_id"]
            isOneToOne: false
            referencedRelation: "arrangementer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrangement_chat_profil_id_fkey"
            columns: ["profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      arrangementer: {
        Row: {
          beskrivelse: string | null
          bilde_url: string | null
          destinasjon: string | null
          fra_facebook: boolean
          id: string
          oppdatert: string
          oppmoetested: string | null
          opprettet: string
          opprettet_av: string | null
          pris_per_person: number | null
          sensurerte_felt: Json
          slutt_tidspunkt: string | null
          start_tidspunkt: string
          tittel: string
          type: Database["public"]["Enums"]["arrangementstype"]
        }
        Insert: {
          beskrivelse?: string | null
          bilde_url?: string | null
          destinasjon?: string | null
          fra_facebook?: boolean
          id?: string
          oppdatert?: string
          oppmoetested?: string | null
          opprettet?: string
          opprettet_av?: string | null
          pris_per_person?: number | null
          sensurerte_felt?: Json
          slutt_tidspunkt?: string | null
          start_tidspunkt: string
          tittel: string
          type: Database["public"]["Enums"]["arrangementstype"]
        }
        Update: {
          beskrivelse?: string | null
          bilde_url?: string | null
          destinasjon?: string | null
          fra_facebook?: boolean
          id?: string
          oppdatert?: string
          oppmoetested?: string | null
          opprettet?: string
          opprettet_av?: string | null
          pris_per_person?: number | null
          sensurerte_felt?: Json
          slutt_tidspunkt?: string | null
          start_tidspunkt?: string
          tittel?: string
          type?: Database["public"]["Enums"]["arrangementstype"]
        }
        Relationships: [
          {
            foreignKeyName: "arrangementer_opprettet_av_fkey"
            columns: ["opprettet_av"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      arrangementmaler: {
        Row: {
          id: string
          navn: string
          opprettet: string | null
          purredato: string | null
          rekkefølge: number
          type: string | null
        }
        Insert: {
          id?: string
          navn: string
          opprettet?: string | null
          purredato?: string | null
          rekkefølge?: number
          type?: string | null
        }
        Update: {
          id?: string
          navn?: string
          opprettet?: string | null
          purredato?: string | null
          rekkefølge?: number
          type?: string | null
        }
        Relationships: []
      }
      arrangoransvar: {
        Row: {
          aar: number
          ansvarlig_id: string | null
          arrangement_id: string | null
          arrangement_navn: string
          id: string
          oppdatert: string
          opprettet: string
          purredato: string | null
        }
        Insert: {
          aar: number
          ansvarlig_id?: string | null
          arrangement_id?: string | null
          arrangement_navn: string
          id?: string
          oppdatert?: string
          opprettet?: string
          purredato?: string | null
        }
        Update: {
          aar?: number
          ansvarlig_id?: string | null
          arrangement_id?: string | null
          arrangement_navn?: string
          id?: string
          oppdatert?: string
          opprettet?: string
          purredato?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arrangoransvar_ansvarlig_id_fkey"
            columns: ["ansvarlig_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arrangoransvar_arrangement_id_fkey"
            columns: ["arrangement_id"]
            isOneToOne: false
            referencedRelation: "arrangementer"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_reaksjoner: {
        Row: {
          emoji: string
          melding_id: string
          opprettet: string
          profil_id: string
        }
        Insert: {
          emoji: string
          melding_id: string
          opprettet?: string
          profil_id: string
        }
        Update: {
          emoji?: string
          melding_id?: string
          opprettet?: string
          profil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_reaksjoner_profil_id_fkey"
            columns: ["profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kaaring_vinnere: {
        Row: {
          aar: number
          arrangement_id: string | null
          begrunnelse: string | null
          id: string
          mal_id: string | null
          oppdatert: string
          opprettet: string
          opprettet_av: string
          poll_id: string | null
          profil_id: string | null
        }
        Insert: {
          aar: number
          arrangement_id?: string | null
          begrunnelse?: string | null
          id?: string
          mal_id?: string | null
          oppdatert?: string
          opprettet?: string
          opprettet_av: string
          poll_id?: string | null
          profil_id?: string | null
        }
        Update: {
          aar?: number
          arrangement_id?: string | null
          begrunnelse?: string | null
          id?: string
          mal_id?: string | null
          oppdatert?: string
          opprettet?: string
          opprettet_av?: string
          poll_id?: string | null
          profil_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kaaring_vinnere_arrangement_id_fkey"
            columns: ["arrangement_id"]
            isOneToOne: false
            referencedRelation: "arrangementer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kaaring_vinnere_mal_id_fkey"
            columns: ["mal_id"]
            isOneToOne: false
            referencedRelation: "kaaringmaler"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kaaring_vinnere_opprettet_av_fkey"
            columns: ["opprettet_av"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kaaring_vinnere_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "poll"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kaaring_vinnere_profil_id_fkey"
            columns: ["profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kaaringmaler: {
        Row: {
          id: string
          kandidat_kilde: string
          navn: string
          opprettet: string
          rekkefolge: number
        }
        Insert: {
          id?: string
          kandidat_kilde?: string
          navn: string
          opprettet?: string
          rekkefolge?: number
        }
        Update: {
          id?: string
          kandidat_kilde?: string
          navn?: string
          opprettet?: string
          rekkefolge?: number
        }
        Relationships: []
      }
      klubb_chat: {
        Row: {
          bilde_url: string | null
          fra_facebook: boolean
          id: string
          innhold: string | null
          kilde_ekstern_id: string | null
          opprettet: string
          profil_id: string
          video_url: string | null
        }
        Insert: {
          bilde_url?: string | null
          fra_facebook?: boolean
          id?: string
          innhold?: string | null
          kilde_ekstern_id?: string | null
          opprettet?: string
          profil_id: string
          video_url?: string | null
        }
        Update: {
          bilde_url?: string | null
          fra_facebook?: boolean
          id?: string
          innhold?: string | null
          kilde_ekstern_id?: string | null
          opprettet?: string
          profil_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "klubb_chat_profil_id_fkey"
            columns: ["profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      melding_bilder: {
        Row: {
          bilde_url: string
          id: string
          melding_id: string
          opprettet: string
          rekkefoelge: number
        }
        Insert: {
          bilde_url: string
          id?: string
          melding_id: string
          opprettet?: string
          rekkefoelge?: number
        }
        Update: {
          bilde_url?: string
          id?: string
          melding_id?: string
          opprettet?: string
          rekkefoelge?: number
        }
        Relationships: [
          {
            foreignKeyName: "melding_bilder_melding_id_fkey"
            columns: ["melding_id"]
            isOneToOne: false
            referencedRelation: "meldinger"
            referencedColumns: ["id"]
          },
        ]
      }
      melding_chat: {
        Row: {
          bilde_url: string | null
          fra_facebook: boolean
          id: string
          innhold: string | null
          kilde_ekstern_id: string | null
          melding_id: string
          opprettet: string
          profil_id: string
          video_url: string | null
        }
        Insert: {
          bilde_url?: string | null
          fra_facebook?: boolean
          id?: string
          innhold?: string | null
          kilde_ekstern_id?: string | null
          melding_id: string
          opprettet?: string
          profil_id: string
          video_url?: string | null
        }
        Update: {
          bilde_url?: string | null
          fra_facebook?: boolean
          id?: string
          innhold?: string | null
          kilde_ekstern_id?: string | null
          melding_id?: string
          opprettet?: string
          profil_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "melding_chat_melding_id_fkey"
            columns: ["melding_id"]
            isOneToOne: false
            referencedRelation: "meldinger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "melding_chat_profil_id_fkey"
            columns: ["profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      melding_reaksjon: {
        Row: {
          emoji: string
          melding_id: string
          opprettet: string
          profil_id: string
        }
        Insert: {
          emoji: string
          melding_id: string
          opprettet?: string
          profil_id: string
        }
        Update: {
          emoji?: string
          melding_id?: string
          opprettet?: string
          profil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "melding_reaksjon_melding_id_fkey"
            columns: ["melding_id"]
            isOneToOne: false
            referencedRelation: "meldinger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "melding_reaksjon_profil_id_fkey"
            columns: ["profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meldinger: {
        Row: {
          album_id: string | null
          album_spotlight_bilde_id: string | null
          fra_facebook: boolean
          id: string
          innhold: string | null
          kilde_ekstern_id: string | null
          opprettet: string
          profil_id: string
          sist_aktivitet: string
        }
        Insert: {
          album_id?: string | null
          album_spotlight_bilde_id?: string | null
          fra_facebook?: boolean
          id?: string
          innhold?: string | null
          kilde_ekstern_id?: string | null
          opprettet?: string
          profil_id: string
          sist_aktivitet?: string
        }
        Update: {
          album_id?: string | null
          album_spotlight_bilde_id?: string | null
          fra_facebook?: boolean
          id?: string
          innhold?: string | null
          kilde_ekstern_id?: string | null
          opprettet?: string
          profil_id?: string
          sist_aktivitet?: string
        }
        Relationships: [
          {
            foreignKeyName: "meldinger_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "album"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meldinger_album_spotlight_bilde_id_fkey"
            columns: ["album_spotlight_bilde_id"]
            isOneToOne: false
            referencedRelation: "album_bilde"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meldinger_profil_id_fkey"
            columns: ["profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      paameldinger: {
        Row: {
          arrangement_id: string
          oppdatert: string
          profil_id: string
          status: Database["public"]["Enums"]["paameldingsstatus"]
        }
        Insert: {
          arrangement_id: string
          oppdatert?: string
          profil_id: string
          status: Database["public"]["Enums"]["paameldingsstatus"]
        }
        Update: {
          arrangement_id?: string
          oppdatert?: string
          profil_id?: string
          status?: Database["public"]["Enums"]["paameldingsstatus"]
        }
        Relationships: [
          {
            foreignKeyName: "paameldinger_arrangement_id_fkey"
            columns: ["arrangement_id"]
            isOneToOne: false
            referencedRelation: "arrangementer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paameldinger_profil_id_fkey"
            columns: ["profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pass_info: {
        Row: {
          nummer: string | null
          oppdatert: string
          profil_id: string
          utloper: string | null
        }
        Insert: {
          nummer?: string | null
          oppdatert?: string
          profil_id: string
          utloper?: string | null
        }
        Update: {
          nummer?: string | null
          oppdatert?: string
          profil_id?: string
          utloper?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pass_info_profil_id_fkey"
            columns: ["profil_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pass_tilgang_forespørsel: {
        Row: {
          arrangement_id: string
          besluttet_av: string | null
          besluttet_paa: string | null
          eier_id: string
          gyldig_til: string | null
          id: string
          opprettet: string
          soker_id: string
          status: string
        }
        Insert: {
          arrangement_id: string
          besluttet_av?: string | null
          besluttet_paa?: string | null
          eier_id: string
          gyldig_til?: string | null
          id?: string
          opprettet?: string
          soker_id: string
          status?: string
        }
        Update: {
          arrangement_id?: string
          besluttet_av?: string | null
          besluttet_paa?: string | null
          eier_id?: string
          gyldig_til?: string | null
          id?: string
          opprettet?: string
          soker_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pass_tilgang_forespørsel_arrangement_id_fkey"
            columns: ["arrangement_id"]
            isOneToOne: false
            referencedRelation: "arrangementer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pass_tilgang_forespørsel_besluttet_av_fkey"
            columns: ["besluttet_av"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pass_tilgang_forespørsel_eier_id_fkey"
            columns: ["eier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pass_tilgang_forespørsel_soker_id_fkey"
            columns: ["soker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      poll: {
        Row: {
          aar: number | null
          arrangement_id: string | null
          avsluttet_paa: string | null
          flervalg: boolean
          id: string
          kaaring_mal_id: string | null
          kontekst: string | null
          kontekst_data: Json | null
          opprettet: string
          opprettet_av: string
          spoersmaal: string
          svarfrist: string
          tiebreak_status: string | null
        }
        Insert: {
          aar?: number | null
          arrangement_id?: string | null
          avsluttet_paa?: string | null
          flervalg?: boolean
          id?: string
          kaaring_mal_id?: string | null
          kontekst?: string | null
          kontekst_data?: Json | null
          opprettet?: string
          opprettet_av: string
          spoersmaal: string
          svarfrist: string
          tiebreak_status?: string | null
        }
        Update: {
          aar?: number | null
          arrangement_id?: string | null
          avsluttet_paa?: string | null
          flervalg?: boolean
          id?: string
          kaaring_mal_id?: string | null
          kontekst?: string | null
          kontekst_data?: Json | null
          opprettet?: string
          opprettet_av?: string
          spoersmaal?: string
          svarfrist?: string
          tiebreak_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "poll_arrangement_id_fkey"
            columns: ["arrangement_id"]
            isOneToOne: false
            referencedRelation: "arrangementer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_kaaring_mal_id_fkey"
            columns: ["kaaring_mal_id"]
            isOneToOne: false
            referencedRelation: "kaaringmaler"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_opprettet_av_fkey"
            columns: ["opprettet_av"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_chat: {
        Row: {
          bilde_url: string | null
          id: string
          innhold: string | null
          opprettet: string
          poll_id: string
          profil_id: string
          video_url: string | null
        }
        Insert: {
          bilde_url?: string | null
          id?: string
          innhold?: string | null
          opprettet?: string
          poll_id: string
          profil_id: string
          video_url?: string | null
        }
        Update: {
          bilde_url?: string | null
          id?: string
          innhold?: string | null
          opprettet?: string
          poll_id?: string
          profil_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "poll_chat_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "poll"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_chat_profil_id_fkey"
            columns: ["profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_stemme: {
        Row: {
          opprettet: string
          poll_id: string
          profil_id: string
          valg_id: string
        }
        Insert: {
          opprettet?: string
          poll_id: string
          profil_id: string
          valg_id: string
        }
        Update: {
          opprettet?: string
          poll_id?: string
          profil_id?: string
          valg_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_stemme_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "poll"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_stemme_profil_id_fkey"
            columns: ["profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_stemme_valg_id_fkey"
            columns: ["valg_id"]
            isOneToOne: false
            referencedRelation: "poll_valg"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_valg: {
        Row: {
          id: string
          opprettet: string
          poll_id: string
          referanse_arrangement_id: string | null
          referanse_profil_id: string | null
          rekkefoelge: number
          tekst: string
        }
        Insert: {
          id?: string
          opprettet?: string
          poll_id: string
          referanse_arrangement_id?: string | null
          referanse_profil_id?: string | null
          rekkefoelge?: number
          tekst: string
        }
        Update: {
          id?: string
          opprettet?: string
          poll_id?: string
          referanse_arrangement_id?: string | null
          referanse_profil_id?: string | null
          rekkefoelge?: number
          tekst?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_valg_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "poll"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_valg_referanse_arrangement_id_fkey"
            columns: ["referanse_arrangement_id"]
            isOneToOne: false
            referencedRelation: "arrangementer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_valg_referanse_profil_id_fkey"
            columns: ["referanse_profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          aktiv: boolean
          bilde_url: string | null
          chat_sist_sett: string | null
          epost: string
          fodselsdato: string | null
          id: string
          navn: string
          oppdatert: string
          opprettet: string
          rolle: string
          telefon: string | null
          visningsnavn: string
        }
        Insert: {
          aktiv?: boolean
          bilde_url?: string | null
          chat_sist_sett?: string | null
          epost: string
          fodselsdato?: string | null
          id: string
          navn: string
          oppdatert?: string
          opprettet?: string
          rolle?: string
          telefon?: string | null
          visningsnavn: string
        }
        Update: {
          aktiv?: boolean
          bilde_url?: string | null
          chat_sist_sett?: string | null
          epost?: string
          fodselsdato?: string | null
          id?: string
          navn?: string
          oppdatert?: string
          opprettet?: string
          rolle?: string
          telefon?: string | null
          visningsnavn?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          endpoint: string
          id: string
          opprettet: string
          p256dh: string
          profil_id: string
        }
        Insert: {
          auth: string
          endpoint: string
          id?: string
          opprettet?: string
          p256dh: string
          profil_id: string
        }
        Update: {
          auth?: string
          endpoint?: string
          id?: string
          opprettet?: string
          p256dh?: string
          profil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profil_id_fkey"
            columns: ["profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      samtale: {
        Row: {
          id: string
          opprettet: string
          profil_a: string
          profil_b: string
          sist_aktivitet: string
        }
        Insert: {
          id?: string
          opprettet?: string
          profil_a: string
          profil_b: string
          sist_aktivitet?: string
        }
        Update: {
          id?: string
          opprettet?: string
          profil_a?: string
          profil_b?: string
          sist_aktivitet?: string
        }
        Relationships: [
          {
            foreignKeyName: "samtale_profil_a_fkey"
            columns: ["profil_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samtale_profil_b_fkey"
            columns: ["profil_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      samtale_chat: {
        Row: {
          bilde_url: string | null
          id: string
          innhold: string | null
          lest: boolean
          opprettet: string
          profil_id: string
          samtale_id: string
          video_url: string | null
        }
        Insert: {
          bilde_url?: string | null
          id?: string
          innhold?: string | null
          lest?: boolean
          opprettet?: string
          profil_id: string
          samtale_id: string
          video_url?: string | null
        }
        Update: {
          bilde_url?: string | null
          id?: string
          innhold?: string | null
          lest?: boolean
          opprettet?: string
          profil_id?: string
          samtale_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "samtale_chat_profil_id_fkey"
            columns: ["profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samtale_chat_samtale_id_fkey"
            columns: ["samtale_id"]
            isOneToOne: false
            referencedRelation: "samtale"
            referencedColumns: ["id"]
          },
        ]
      }
      varsel_innstillinger: {
        Row: {
          aktiv: boolean
          beskrivelse: string | null
          dager_foer: number | null
          id: string
          noekkel: string
          oppdatert: string
        }
        Insert: {
          aktiv?: boolean
          beskrivelse?: string | null
          dager_foer?: number | null
          id?: string
          noekkel: string
          oppdatert?: string
        }
        Update: {
          aktiv?: boolean
          beskrivelse?: string | null
          dager_foer?: number | null
          id?: string
          noekkel?: string
          oppdatert?: string
        }
        Relationships: []
      }
      varsel_logg: {
        Row: {
          arrangement_id: string | null
          id: string
          kanal: string | null
          lest: boolean
          melding: string
          opprettet: string | null
          poll_id: string | null
          profil_id: string
          tittel: string
          type: string | null
          url: string | null
        }
        Insert: {
          arrangement_id?: string | null
          id?: string
          kanal?: string | null
          lest?: boolean
          melding: string
          opprettet?: string | null
          poll_id?: string | null
          profil_id: string
          tittel: string
          type?: string | null
          url?: string | null
        }
        Update: {
          arrangement_id?: string | null
          id?: string
          kanal?: string | null
          lest?: boolean
          melding?: string
          opprettet?: string | null
          poll_id?: string | null
          profil_id?: string
          tittel?: string
          type?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personlige_varsler_profil_id_fkey"
            columns: ["profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "varsel_logg_arrangement_id_fkey"
            columns: ["arrangement_id"]
            isOneToOne: false
            referencedRelation: "arrangementer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "varsel_logg_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "poll"
            referencedColumns: ["id"]
          },
        ]
      }
      varsel_preferanser: {
        Row: {
          epost_aktiv: boolean
          oppdatert: string | null
          profil_id: string
          push_aktiv: boolean
        }
        Insert: {
          epost_aktiv?: boolean
          oppdatert?: string | null
          profil_id: string
          push_aktiv?: boolean
        }
        Update: {
          epost_aktiv?: boolean
          oppdatert?: string | null
          profil_id?: string
          push_aktiv?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "varsel_preferanser_profil_id_fkey"
            columns: ["profil_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vedtekter: {
        Row: {
          id: string
          innhold: string
          oppdatert: string
          slug: string
          tittel: string
        }
        Insert: {
          id?: string
          innhold: string
          oppdatert?: string
          slug: string
          tittel: string
        }
        Update: {
          id?: string
          innhold?: string
          oppdatert?: string
          slug?: string
          tittel?: string
        }
        Relationships: []
      }
      vedtekter_versjoner: {
        Row: {
          endret_av: string | null
          endringsnotat: string
          id: string
          innhold: string
          opprettet: string
          vedtaksdato: string
          vedtekt_id: string
        }
        Insert: {
          endret_av?: string | null
          endringsnotat: string
          id?: string
          innhold: string
          opprettet?: string
          vedtaksdato: string
          vedtekt_id: string
        }
        Update: {
          endret_av?: string | null
          endringsnotat?: string
          id?: string
          innhold?: string
          opprettet?: string
          vedtaksdato?: string
          vedtekt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vedtekter_versjoner_endret_av_fkey"
            columns: ["endret_av"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vedtekter_versjoner_vedtekt_id_fkey"
            columns: ["vedtekt_id"]
            isOneToOne: false
            referencedRelation: "vedtekter"
            referencedColumns: ["id"]
          },
        ]
      }
      vitals_logg: {
        Row: {
          device_type: string | null
          id: string
          metric: string
          opprettet: string
          rating: string | null
          rute: string
          verdi: number
        }
        Insert: {
          device_type?: string | null
          id?: string
          metric: string
          opprettet?: string
          rating?: string | null
          rute: string
          verdi: number
        }
        Update: {
          device_type?: string | null
          id?: string
          metric?: string
          opprettet?: string
          rating?: string | null
          rute?: string
          verdi?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      avslutt_kaaringspoll: {
        Args: { p_poll_id: string }
        Returns: {
          status: string
          var_ny: boolean
          vinner_arrangement_id: string
          vinner_profil_id: string
        }[]
      }
      er_admin: { Args: never; Returns: boolean }
      er_generalsekretaer: { Args: never; Returns: boolean }
      fjern_generalsekretaer: {
        Args: { forventet_profil?: string }
        Returns: {
          forrige_navn: string
          forrige_profil: string
        }[]
      }
      get_statistikk: { Args: never; Returns: Json }
      har_pass_tilgang: { Args: { eier: string }; Returns: boolean }
      lukk_kaaringspoll_naa: {
        Args: { p_poll_id: string }
        Returns: {
          status: string
          var_ny: boolean
          vinner_arrangement_id: string
          vinner_profil_id: string
        }[]
      }
      marker_chat_sett: { Args: never; Returns: undefined }
      sett_generalsekretaer: {
        Args: { ny_profil: string }
        Returns: {
          forrige_navn: string
          forrige_profil: string
        }[]
      }
      tell_poll_stemmer: {
        Args: { p_poll_id: string }
        Returns: {
          antall: number
          valg_id: string
        }[]
      }
    }
    Enums: {
      arrangementstype: "moete" | "tur"
      paameldingsstatus: "ja" | "nei" | "kanskje"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      arrangementstype: ["moete", "tur"],
      paameldingsstatus: ["ja", "nei", "kanskje"],
    },
  },
} as const
