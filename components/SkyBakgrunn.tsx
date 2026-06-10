export default function SkyBakgrunn() {
  return (
    <div className="fixed top-0 left-0 right-0 h-96 pointer-events-none z-0 overflow-hidden">
      <svg
        viewBox="0 0 390 220"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
        preserveAspectRatio="xMidYTop slice"
      >
        <defs>
          {/* Blur for myke kanter */}
          <filter id="blurMyk" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
          <filter id="blurGrov" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" />
          </filter>

          {/* Fade ned mot mørk bakgrunn */}
          <linearGradient id="nedFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="40%" stopColor="#111111" stopOpacity="0" />
            <stop offset="100%" stopColor="#111111" stopOpacity="1" />
          </linearGradient>

          {/* Hvit sky-gradient — lysere midten */}
          <radialGradient id="skyHvit1" cx="50%" cy="60%" r="50%">
            <stop offset="0%" stopColor="white" stopOpacity="0.95" />
            <stop offset="100%" stopColor="white" stopOpacity="0.3" />
          </radialGradient>
          <radialGradient id="skyHvit2" cx="50%" cy="60%" r="50%">
            <stop offset="0%" stopColor="white" stopOpacity="0.90" />
            <stop offset="100%" stopColor="white" stopOpacity="0.25" />
          </radialGradient>
        </defs>


        {/* === SKY 1 — stor, venstre-midten === */}
        <g opacity="0.22" filter="url(#blurMyk)">
          {/* Bunn-base */}
          <ellipse cx="130" cy="68" rx="100" ry="28" fill="url(#skyHvit1)" />
          {/* Bobler på toppen */}
          <ellipse cx="80" cy="50" rx="42" ry="30" fill="url(#skyHvit1)" />
          <ellipse cx="120" cy="40" rx="50" ry="34" fill="url(#skyHvit1)" />
          <ellipse cx="165" cy="48" rx="44" ry="28" fill="url(#skyHvit1)" />
          <ellipse cx="200" cy="58" rx="36" ry="22" fill="url(#skyHvit1)" />
          {/* Topp-bobbler */}
          <ellipse cx="105" cy="32" rx="28" ry="20" fill="url(#skyHvit1)" />
          <ellipse cx="140" cy="25" rx="32" ry="22" fill="url(#skyHvit1)" />
          <ellipse cx="172" cy="34" rx="26" ry="18" fill="url(#skyHvit1)" />
        </g>

        {/* === SKY 2 — høyre side === */}
        <g opacity="0.18" filter="url(#blurMyk)">
          <ellipse cx="315" cy="52" rx="82" ry="24" fill="url(#skyHvit2)" />
          <ellipse cx="268" cy="37" rx="38" ry="26" fill="url(#skyHvit2)" />
          <ellipse cx="305" cy="28" rx="46" ry="30" fill="url(#skyHvit2)" />
          <ellipse cx="348" cy="35" rx="40" ry="26" fill="url(#skyHvit2)" />
          <ellipse cx="383" cy="46" rx="30" ry="20" fill="url(#skyHvit2)" />
          <ellipse cx="288" cy="20" rx="26" ry="18" fill="url(#skyHvit2)" />
          <ellipse cx="326" cy="15" rx="30" ry="20" fill="url(#skyHvit2)" />
          <ellipse cx="360" cy="22" rx="24" ry="17" fill="url(#skyHvit2)" />
        </g>

        {/* === SKY 3 — liten, bak til høyre === */}
        <g opacity="0.10" filter="url(#blurGrov)">
          <ellipse cx="240" cy="80" rx="55" ry="18" fill="white" />
          <ellipse cx="215" cy="68" rx="30" ry="20" fill="white" />
          <ellipse cx="248" cy="62" rx="36" ry="22" fill="white" />
          <ellipse cx="278" cy="70" rx="28" ry="17" fill="white" />
        </g>

        {/* Fade ut mot mørk bakgrunn */}
        <rect width="390" height="220" fill="url(#nedFade)" />
      </svg>
    </div>
  )
}
