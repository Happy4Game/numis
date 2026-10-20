export function GH({ children }) { return <h4 className="text-[13.5px] font-semibold text-text mt-5 mb-1.5 first:mt-0">{children}</h4> }
export function GP({ children }) { return <p className="text-[13px] text-muted leading-relaxed mb-2">{children}</p> }
export function GL({ items }) {
  return <ul className="space-y-1.5 mb-2">{items.map((t, i) => (<li key={i} className="flex gap-2 text-[13px] text-muted leading-relaxed"><span className="text-accent mt-px shrink-0">▸</span><span>{t}</span></li>))}</ul>
}
export function GSteps({ items }) {
  return <ol className="space-y-2 mb-2">{items.map((t, i) => (<li key={i} className="flex gap-2.5 text-[13px] text-muted leading-relaxed"><span className="shrink-0 w-5 h-5 grid place-items-center rounded-full bg-accent/15 text-sky2 text-[11px] font-mono">{i + 1}</span><span className="pt-0.5">{t}</span></li>))}</ol>
}
export function Code({ children }) { return <code className="px-1.5 py-0.5 rounded text-[12px] font-mono bg-raised/70 text-sky2 border border-line break-words">{children}</code> }
export const B = ({ children }) => <b className="text-text font-medium">{children}</b>
export function GT({ head, rows }) {
  return (
    <div className="overflow-x-auto my-2 rounded-lg border border-line/60">
      <table className="w-full text-[12.5px]">
        <thead><tr className="bg-raised/60 text-faint">{head.map((h, i) => (<th key={i} className="text-left font-medium px-3 py-1.5 whitespace-nowrap">{h}</th>))}</tr></thead>
        <tbody>{rows.map((r, i) => (<tr key={i} className="border-t border-line/50">{r.map((c, j) => (<td key={j} className="px-3 py-1.5 align-top text-muted">{c}</td>))}</tr>))}</tbody>
      </table>
    </div>
  )
}
export function Note({ children, tone }) {
  const c = tone === 'warn' ? 'border-warn/40 bg-warn/10' : tone === 'alert' ? 'border-alert/40 bg-alert/10' : 'border-accent/40 bg-accent/10'
  return <div className={"rounded-lg border px-3 py-2 my-2 text-[12.5px] text-muted leading-relaxed " + c}>{children}</div>
}

export const GUIDE = [
  { id: 'projet', icon: '🎯', title: 'Le projet', body: (<div>
    <GP>Numis est une plateforme de paiement <B>fictive</B>. Son but : démontrer la <B>cyber-résilience</B> — le système détecte une attaque ou une panne, décide de la bonne action, se répare <B>sans intervention humaine</B> (Zero-Touch Recovery), puis <B>prouve</B> qu'il est de nouveau utilisable.</GP>
    <GH>Le fil rouge : deux natures d'incident</GH>
    <GL items={[<><B>Disponibilité</B> (DoS/DDoS, crash d'un conteneur, panne de base) → on <B>rétablit</B> : redémarrage, délestage ciblé, diagnostic de dépendance.</>, <><B>Compromission</B> (injection SQL, XSS, traversée de chemin) → on <B>bloque en amont</B> via le WAF + alerte SOC. On n'« auto-répare » pas une fuite : ce serait malhonnête de le prétendre.</>]} />
    <GH>La chaîne complète</GH>
    <GP><B>détection → décision → reprise → vérification</B>. Chaque étape est visible en direct ici et dans Grafana. L'IA ne « devine » rien en boîte noire : elle s'appuie sur des métriques mesurées et explique la feature qui a dérivé.</GP>
    <GH>Les 5 piliers imposés</GH>
    <GL items={[<><B>Développement</B> : les services <Code>auth</Code>, <Code>payment-api</Code>, le dashboard.</>, <><B>Infrastructure</B> : Docker Compose, Ansible, Prometheus/Grafana/Loki.</>, <><B>IA / Data</B> : le détecteur d'anomalies et l'assistant RAG.</>, <><B>Cybersécurité</B> : WAF, SOC, secrets, scénarios d'attaque.</>, <><B>Gouvernance</B> : EBIOS RM, PCA/PRA, NIS2/DORA.</>]} />
  </div>) },

  { id: 'dashboard', icon: '🧭', title: 'Lire le dashboard', body: (<div>
    <GH>Trois pages (flèches ← →, clavier, ou barre du bas)</GH>
    <GL items={[<><B>Détection & reprise</B> : le détecteur IA et la reprise autonome côte à côte.</>, <><B>Vue d'ensemble</B> (centre) : KPI temps réel, paiement Numis, synthèse.</>, <><B>Conteneurs</B> : l'état de vie de toute la stack (watchdog).</>]} />
    <GH>Le bandeau de KPI, précisément</GH>
    <GT head={["KPI", "Signification", "Source"]} rows={[
      ["Système", "sain / incident", "flag du détecteur"],
      ["Débit", "requêtes par seconde", "rate(http_requests_total[1m])"],
      ["Latence p95", "95 % des réponses sont plus rapides que cette valeur", "histogram_quantile(0.95, …)"],
      ["Taux d'erreur", "part de réponses 5xx", "5xx / total"],
      ["Conteneurs", "actifs / total", "watchdog"],
      ["Reprises", "nb d'actions autonomes", "remediation-engine"],
    ]} />
    <GH>Panneaux repliables</GH>
    <GP>Chaque panneau a un chevron <B>▼</B> en haut à droite pour le replier — pratique pour se concentrer sur une brique.</GP>
    <GH>Retours sonores & visuels</GH>
    <GL items={[<><B>Carillon</B> + éclat au curseur à chaque paiement réglé.</>, <><B>Bip d'alerte</B> au déclenchement d'un incident (une seule fois, au front montant).</>, <>Animations <B>événementielles</B> uniquement (jamais en boucle), désactivées si « réduire les animations » est actif.</>]} />
    <Note>Les navigateurs exigent une interaction avant de jouer un son : comme la connexion et les clics ont lieu dès l'ouverture, l'audio fonctionne ; sinon un simple clic débloque.</Note>
  </div>) },

  { id: 'composants', icon: '🧩', title: 'Les composants', body: (<div>
    <GP>La plateforme est un ensemble de <B>14 conteneurs</B> orchestrés par Docker Compose. Voici le rôle de chacun et s'il est exposé à l'extérieur.</GP>
    <GT head={["Conteneur", "Rôle", "Exposé ?"]} rows={[
      ["db", "PostgreSQL — comptes & transactions", "non"],
      ["auth", "émission des JWT + anti-brute-force", "non"],
      ["payment-api", "métier : transactions + délestage", "via WAF"],
      ["waf", "pare-feu applicatif ModSecurity (CRS)", ":8080"],
      ["prometheus", "collecte des métriques", "non"],
      ["alertmanager", "alertes SOC", "non"],
      ["loki", "centralisation des logs", "non"],
      ["promtail", "collecte des journaux", "non"],
      ["grafana", "dashboards & alerting (SOC)", ":3000"],
      ["ml-detector", "détection d'anomalies (IA)", "non"],
      ["remediation-engine", "reprise autonome + watchdog", "non"],
      ["ollama", "LLM local (assistant)", "non"],
      ["rag-assistant", "assistant opérateur (RAG)", ":8001"],
      ["frontend", "ce dashboard (React/nginx)", ":3001"],
    ]} />
    <Note tone="warn">Principe : <B>seuls le WAF, Grafana, le RAG et le dashboard</B> sont exposés. Tout le reste est interne — le dashboard atteint les services internes par un reverse-proxy nginx.</Note>
  </div>) },

  { id: 'flux', icon: '🔄', title: "Flux d'une requête", body: (<div>
    <GH>Chemin métier nominal</GH>
    <GSteps items={[
      <>Le navigateur envoie la requête au <B>WAF</B> (<Code>:8080</Code>), seul point d'entrée public.</>,
      <>Le WAF inspecte (règles OWASP) et relaie à <Code>payment-api</Code>.</>,
      <>Pour un virement, <Code>payment-api</Code> valide le <B>JWT localement</B> avec le secret partagé — pas d'appel à <Code>auth</Code> à chaque requête.</>,
      <>Il ouvre une transaction, prend un verrou <Code>FOR UPDATE</Code> sur le compte source, débite/crédite, journalise.</>,
      <>La réponse remonte ; <Code>payment-api</Code> incrémente ses métriques Prometheus au passage.</>,
    ]} />
    <GH>Pourquoi valider le JWT localement ?</GH>
    <GP>Sous une charge d'attaque, un aller-retour réseau vers <Code>auth</Code> à chaque requête deviendrait un goulot. En validant la signature localement (secret partagé HS256), <Code>payment-api</Code> reste rapide ; <Code>auth</Code> garde la responsabilité unique d'<B>émettre</B> les jetons.</GP>
    <GH>Le jeton (JWT)</GH>
    <GP>À la connexion, <Code>auth</Code> renvoie un <Code>access_token</Code> signé. Le dashboard l'ajoute en en-tête <Code>{'Authorization: Bearer <token>'}</Code> sur chaque appel métier.</GP>
  </div>) },

  { id: 'ia', icon: '🧠', title: 'Détection IA', body: (<div>
    <GP>Un <B>Isolation Forest</B> (scikit-learn, 100 arbres, contamination 0.1) apprend le profil de trafic <B>normal</B>, puis signale ce qui s'en écarte. Non supervisé, léger, et surtout <B>explicable</B>.</GP>
    <GH>Comment ça marche (en bref)</GH>
    <GP>L'algorithme isole chaque point en le « découpant » au hasard. Un point <B>anormal</B> se retrouve isolé en peu de découpes → score négatif. Un point <B>normal</B>, noyé dans la masse, demande beaucoup de découpes.</GP>
    <GH>Les 3 signaux (interrogés toutes les 10 s via PromQL)</GH>
    <GT head={["Signal", "Requête PromQL"]} rows={[
      ["Débit", <Code>{'sum(rate(http_requests_total{job="payment-api"}[1m]))'}</Code>],
      ["Taux d'erreur", <Code>{'rate(5xx[1m]) / rate(total[1m])'}</Code>],
      ["Latence p95", <Code>{'histogram_quantile(0.95, …_bucket[1m])'}</Code>],
    ]} />
    <GP>Les features sont <B>normalisées (z-score)</B> avec la moyenne/écart-type appris, pour que trois unités différentes soient comparables.</GP>
    <GH>Le déroulé, étape par étape</GH>
    <GSteps items={[
      <><B>Apprentissage</B> (warmup) : <Code>20</Code> observations pour fixer la normalité (baseline).</>,
      <><B>Surveillance</B> : à chaque cycle, score d'anomalie (sous 0 = anormal).</>,
      <><B>Garde de dégradation</B> : anomalie retenue seulement si dégradation <B>réelle</B> — taux d'erreur &gt; <Code>5 %</Code> OU latence p95 &gt; <Code>300 ms</Code>.</>,
      <><B>Persistance</B> : incident déclaré après <Code>2</Code> cycles consécutifs (anti faux-positif), puis appel au moteur de reprise avec l'explication.</>,
      <><B>Re-arm</B> : après action, il ne ré-agit que lorsque les métriques sont redevenues normales (ou au bout de <Code>120 s</Code> si l'attaque continue).</>,
    ]} />
    <Note>Sans la garde de dégradation, un site <B>inactif</B> (trafic ≈ 0) paraîtrait « anormal ». On exige donc une vraie dégradation observable avant de déclencher.</Note>
    <GH>Le modèle survit aux redémarrages</GH>
    <GP>Le modèle entraîné est persisté (<Code>/model/model.pkl</Code>) : pas besoin de ré-apprendre à chaque relance. <Code>make train</Code> l'entraîne hors-ligne, <Code>make retrain</Code> repart à neuf.</GP>
  </div>) },

  { id: 'reprise', icon: '🔧', title: 'Reprise autonome', body: (<div>
    <GP>Le <Code>remediation-engine</Code> reçoit l'alerte du détecteur (avec un <B>jeton</B>), applique un <B>playbook</B>, puis <B>vérifie</B> le rétablissement.</GP>
    <GH>Décision (diagnostic de dépendance)</GH>
    <GT head={["Symptôme", "Action"]} rows={[
      ["payment-api injoignable", "restart rsa-payment-api"],
      ["base injoignable (dépendance)", "restart rsa-db"],
      ["service debout mais dégradé (surcharge)", "throttle (délestage ciblé)"],
    ]} />
    <GP>La règle de base : <B>service injoignable → conteneur planté → restart</B> ; <B>service debout mais saturé → throttle</B>.</GP>
    <GH>Le throttle est adaptatif</GH>
    <GP>Il démarre à <Code>10 rps</Code> et, si la surcharge persiste (nouvelle action dans les 120 s), il <B>divise le budget par deux</B> (plancher 3 rps) — escalade progressive jusqu'à soulager le système.</GP>
    <GH>Vérification (le point crucial)</GH>
    <GP>Un conteneur relancé ne suffit pas : le moteur <B>attend le retour à <Code>/health</Code></B> et mesure la durée → « rétabli en X s ». On prouve le retour à un état <B>utilisable</B>, pas juste « le process tourne ».</GP>
    <GH>Privilèges encadrés (point noté §3.4)</GH>
    <GL items={[<><B>Isolation</B> : seul lui monte le socket Docker.</>, <><B>Allowlist de cibles</B> : <Code>rsa-payment-api, rsa-db</Code> — toute autre cible = refus 403.</>, <><B>Allowlist d'actions</B> : <Code>restart</Code> / <Code>throttle</Code> uniquement, pas d'exec arbitraire.</>, <><B>Jeton</B> <Code>x-remediation-token</Code> obligatoire ; <B>traçabilité</B> de chaque demande (métriques).</>]} />
  </div>) },

  { id: 'watchdog', icon: '🫀', title: 'Watchdog & conteneurs', body: (<div>
    <GP>Le détecteur surveille l'<B>API de paiement</B>. En complément, un <B>watchdog</B> surveille la <B>vie de toute la stack</B> (toutes les <Code>10 s</Code>).</GP>
    <GL items={[<>Si un conteneur est <B>mort</B> (état <Code>exited</Code>/<Code>dead</Code> confirmé), il est <B>redémarré</B> automatiquement.</>, <>Un <B>cooldown</B> de <Code>60 s</Code> par conteneur évite les boucles de redémarrage sur un crash répété.</>, <>Il ignore les états transitoires (<Code>created</Code>, <Code>restarting</Code>, <Code>paused</Code>) pour ne pas gêner un démarrage normal.</>]} />
    <GP>La page <B>Conteneurs</B> affiche chaque service avec une pastille <span className="text-money">verte</span> (actif) ou <span className="text-alert">rouge</span> (à relancer), et le bandeau KPI « Conteneurs » résume actifs/total.</GP>
    <Note>À tester : <Code>make chaos-kill</Code> (tue l'API) ou <Code>make chaos-kill-db</Code> (tue la base) — et observe la reprise dans « Détection & reprise ».</Note>
  </div>) },

  { id: 'secu', icon: '🛡️', title: 'Sécurité & WAF', body: (<div>
    <GP>Le <B>WAF ModSecurity</B> avec le jeu de règles <B>OWASP CRS</B> filtre tout le trafic entrant de l'API. C'est le seul point d'entrée publié.</GP>
    <GH>Ce qu'il bloque</GH>
    <GL items={[<><B>Injections SQL</B> — manipulation de requêtes via des entrées piégées.</>, <><B>XSS</B> — injection de scripts dans des champs.</>, <><B>Traversées de chemin</B> — tentatives d'accès à des fichiers hors périmètre.</>, <><B>Scans de reconnaissance</B> — sondes automatisées.</>]} />
    <GH>Autres défenses</GH>
    <GL items={[<><B>Anti-brute-force</B> sur <Code>auth</Code> : verrouillage temporaire après plusieurs échecs (renvoie 429).</>, <><B>Secrets</B> chiffrés avec <B>SOPS + age</B> (pas de mot de passe en clair dans le dépôt).</>, <><B>JWT</B> signés (HS256), validés localement par l'API.</>]} />
    <GH>Dispo vs compromission</GH>
    <GP>Une injection SQL bloquée n'est pas « réparée » par un redémarrage : on la <B>bloque en amont</B> et on lève une <B>alerte SOC</B>. On ne prétend pas auto-remédier une compromission — c'est une limite assumée, défendable au jury.</GP>
    <Note tone="warn">À tester : <Code>make attack-sqli</Code> (injection bloquée) ou <Code>make attack-all</Code> (catalogue Red/Blue complet avec synthèse).</Note>
  </div>) },

  { id: 'ddos', icon: '🌊', title: 'DDoS : délestage ciblé', body: (<div>
    <GH>Le piège du délestage naïf</GH>
    <GP>Un rate-limit <B>global</B> fait tomber aussi les clients légitimes : le flood remplit le budget par seconde, et un vrai virement est rejeté <B>en même temps</B> que l'attaquant (429). C'était le symptôme « je ne peux plus payer du tout ».</GP>
    <GH>La signature de l'attaque</GH>
    <GP>Le DoS martèle <Code>POST /transactions</Code> sur le <B>même compte</B> (<Code>from == to</Code>, montant 1, net nul). Chaque requête prend un verrou <Code>FOR UPDATE</Code> + une connexion du pool → contention → latence et erreurs qui grimpent.</GP>
    <GH>Notre approche : délestage CIBLÉ</GH>
    <GSteps items={[
      <>Hors protection, le motif passe normalement → la dégradation est <B>réelle et observable</B> → la détection se déclenche.</>,
      <>Sous protection, on rejette <B>tôt</B> l'auto-virement net-nul (<Code>from == to</Code>) avec un <Code>429</Code>, <B>avant toute prise de verrou DB</B>.</>,
      <>Les virements <B>légitimes</B> (<Code>from != to</Code>) ne sont pas comptés dans un budget global : ils passent.</>,
      <>Un <Code>lock_timeout</Code> de <Code>600 ms</Code> empêche un virement légitime de rester bloqué derrière le flood.</>,
    ]} />
    <Note>Résultat : <B>on peut toujours payer pendant un DDoS</B> (entre deux comptes différents), tandis que le flood est absorbé à coût quasi nul. À tester : <Code>make attack-ddos</Code> (5 min, 80 threads).</Note>
  </div>) },

  { id: 'obs', icon: '📡', title: 'Observabilité / SOC', body: (<div>
    <GP>Deux chaînes complémentaires : les <B>métriques</B> (chiffres) et les <B>logs</B> (événements).</GP>
    <GH>Métriques</GH>
    <GL items={[<><B>Prometheus</B> scrape <Code>/metrics</Code> toutes les <Code>10 s</Code> (jobs : payment-api, auth, ml-detector, remediation).</>, <>PromQL calcule débit, taux d'erreur et latence p95 (histogrammes).</>, <><B>Alertmanager</B> publie des alertes lisibles (fonction SOC).</>]} />
    <GH>Logs</GH>
    <GL items={[<>Tous les services émettent des <B>logs JSON structurés</B>.</>, <><B>Promtail</B> les collecte → <B>Loki</B> les centralise → <B>Grafana</B> les explore.</>]} />
    <GH>Pourquoi pas Elastic ?</GH>
    <GP>Trop lourd pour 16 Go de RAM. <B>Loki + Grafana</B> tiennent le rôle de <B>SIEM/SOC léger</B> — un choix assumé et justifié dans la doc. Grafana est accessible (lecture seule) depuis l'en-tête du dashboard.</GP>
  </div>) },

  { id: 'rag', icon: '💬', title: 'Assistant RAG', body: (<div>
    <GP>Un <B>assistant opérateur</B> local répond en langage naturel sur les procédures, à partir de la <B>documentation du projet</B> (runbooks, architecture…).</GP>
    <GH>RAG = Retrieval-Augmented Generation</GH>
    <GSteps items={[
      <>La doc est découpée en morceaux et transformée en <B>vecteurs</B> (embeddings) stockés dans <B>Chroma</B>.</>,
      <>À une question, on récupère les passages les plus <B>proches</B> sémantiquement.</>,
      <>Le <B>LLM local</B> (Ollama, Qwen2.5 3B) rédige une réponse <B>en s'appuyant uniquement</B> sur ces passages.</>,
    ]} />
    <Note tone="warn">L'assistant lit la doc en <B>lecture seule</B> et n'a <B>AUCUN privilège</B> sur le système. Il est volontairement <B>distinct</B> du moteur de remédiation (sujet §3.3) : il explique, il n'agit jamais.</Note>
  </div>) },

  { id: 'demo', icon: '🎬', title: 'Jouer la démo', body: (<div>
    <GP>Scénario principal (reprise autonome), sans aucune intervention humaine :</GP>
    <GSteps items={[
      <><B>Observer</B> : garde le dashboard ouvert (+ Grafana).</>,
      <><B>Attaquer</B> depuis le PC attaquant : <Code>make attack-dos</Code> (ou <Code>attack-ddos</Code>).</>,
      <>La latence et les erreurs grimpent → le détecteur passe en <B>Anomalie</B> (après 2 cycles).</>,
      <>Le moteur applique restart ou throttle, puis <B>vérifie /health</B> → « rétabli en X s ».</>,
      <>Le dashboard repasse au vert ; un virement témoin réussit.</>,
    ]} />
    <GH>Les autres scénarios</GH>
    <GT head={["Commande", "Montre"]} rows={[
      [<Code>make chaos-kill</Code>, "crash API → détection + restart"],
      [<Code>make chaos-kill-db</Code>, "panne base → diagnostic de dépendance"],
      [<Code>make attack-sqli</Code>, "injection → blocage WAF + alerte"],
      [<Code>make attack-all</Code>, "catalogue Red/Blue + synthèse"],
      [<Code>make smoke</Code>, "preuve que le métier répond"],
    ]} />
  </div>) },

  { id: 'gouvernance', icon: '📋', title: 'Gouvernance & conformité', body: (<div>
    <GP>Au-delà de la technique, le projet porte les livrables de gouvernance attendus :</GP>
    <GL items={[<><B>EBIOS RM</B> — analyse de risque (événements redoutés, scénarios, mesures).</>, <><B>PCA / PRA</B> — plan de continuité et de reprise d'activité.</>, <><B>NIS2 / DORA</B> — cadrage réglementaire (résilience des entités, secteur financier).</>, <><B>Matrice Red/Blue</B> — chaque attaque mise en face de sa défense.</>, <><B>Contributions</B> — qui a fait quoi (exigé par la grille).</>]} />
    <Note>Ces documents sont dans le dossier <Code>docs/</Code> et alimentent le <Code>Dossier.pdf</Code>.</Note>
  </div>) },

  { id: 'glossaire', icon: '📖', title: 'Glossaire', body: (<div>
    <GT head={["Terme", "Définition"]} rows={[
      ["Zero-Touch Recovery", "reprise sans intervention humaine"],
      ["Isolation Forest", "modèle ML non supervisé de détection d'anomalies"],
      ["z-score", "normalisation (valeur − moyenne) / écart-type"],
      ["Latence p95", "95 % des réponses sont plus rapides que cette valeur"],
      ["WAF", "Web Application Firewall (pare-feu applicatif)"],
      ["CRS", "Core Rule Set — règles OWASP du WAF"],
      ["SOC / SIEM", "supervision & corrélation des événements de sécurité"],
      ["JWT", "jeton d'authentification signé"],
      ["FOR UPDATE", "verrou de ligne SQL le temps d'une transaction"],
      ["RAG", "génération augmentée par récupération de documents"],
      ["Throttle", "délestage : on limite le débit pour soulager le service"],
      ["PromQL", "langage de requête des métriques Prometheus"],
    ]} />
  </div>) },
]

export function Guide({ open, onClose, sec, setSec }) {
  if (!open) return null
  const S = GUIDE[sec] || GUIDE[0]
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-deep/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-5xl h-[88vh] rounded-2xl glass border border-hair shadow-2xl flex overflow-hidden anim-fadeup" onClick={(e) => e.stopPropagation()}>
        <aside className="w-60 shrink-0 border-r border-line/60 p-3 overflow-y-auto hidden sm:block">
          <div className="px-2 py-2 text-[11px] uppercase tracking-wider text-faint">Comprendre le système</div>
          {GUIDE.map((g, i) => (
            <button key={g.id} onClick={() => setSec(i)}
              className={"btn-flat w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left mb-0.5 " + (i === sec ? 'bg-accent/15 text-text ring-1 ring-accent/30' : 'text-muted hover:bg-raised/60 hover:text-text')}>
              <span className="text-[15px] leading-none">{g.icon}</span>{g.title}
            </button>
          ))}
        </aside>
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center justify-between px-5 py-3 border-b border-line/60 shrink-0">
            <div className="flex items-center gap-2.5"><span className="text-[18px]">{S.icon}</span><h3 className="text-[16px] font-semibold text-text">{S.title}</h3>
              <span className="text-[11px] text-faint font-mono hidden sm:inline">{sec + 1}/{GUIDE.length}</span></div>
            <button onClick={onClose} title="Fermer (Échap)" className="btn-flat w-8 h-8 grid place-items-center rounded-lg text-muted hover:text-text hover:bg-raised/70">✕</button>
          </header>
          <div className="p-5 overflow-y-auto">{S.body}</div>
          <div className="sm:hidden flex gap-1.5 overflow-x-auto px-3 py-2 border-t border-line/60">
            {GUIDE.map((g, i) => (
              <button key={g.id} onClick={() => setSec(i)}
                className={"btn-flat shrink-0 w-9 h-9 grid place-items-center rounded-full text-[15px] " + (i === sec ? 'bg-accent/15 ring-1 ring-accent/30' : 'bg-raised/40')}>{g.icon}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
