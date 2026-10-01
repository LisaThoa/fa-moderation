# fa-moderation

Outils de modération pour les forums **Forumactif**, réservés au staff.

Le plugin tourne sur le forum : ses requêtes partent avec la session de la personne connectée. Il voit donc les sections privées auxquelles elle a accès, sans service externe ni base de données.

## Modules

| module | état | rôle |
| --- | --- | --- |
| `recensement` | disponible | membres sans activité RP sur la période, puis archivage des sujets |
| `validation` | prévu | validation d'une fiche en un clic : groupe, rang, déplacement, message, bottins |
| `profil` | prévu | panneau de modération sur le profil d'un membre |

## Fichiers

| fichier | rôle |
| --- | --- |
| `config.js` | modèle de configuration, commenté |
| `config.css` | variables d'apparence, à copier dans la feuille de style du forum |
| `fa-moderation.js` | le plugin |
| `fa-moderation.css` | la structure, chargée automatiquement depuis le dossier du plugin |

## Installation

1. *PA > Modules > HTML & JAVASCRIPT > Gestion des codes Javascript* : activer la gestion des codes, puis créer un script placé *sur toutes les pages*.
2. Y écrire la configuration (voir `config.js`), puis charger le plugin :

```js
window.FA_MODERATION_CONFIG = {
  emplacement: { cible: '#fa-moderation' },
  recensement: { activites: '/f7-activites-rp', archive: '/f2-corbeille' }
};

(function () {
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/gh/LisaThoa/fa-moderation@<version>/fa-moderation.js';
  document.head.appendChild(s);
})();
```

   `<version>` est un numéro de commit ou de version. `@main` est à éviter : chaque modification du dépôt arriverait sur le forum sans contrôle.

3. Placer l'élément d'accueil (`<div id="fa-moderation"></div>`) dans un template ou une page HTML.
4. Facultatif : copier `config.css` dans *PA > Affichage > Couleurs > Feuille de style CSS* pour ajuster l'apparence.

Pour les visiteurs qui ne sont ni administrateurs ni modérateurs, le plugin ne s'installe pas (`window.FAModeration` reste indéfini) et n'affiche rien.

## Recensement

### Principe

Deux organisations sont prises en charge, selon ce qui est indiqué dans le champ « Activités RP » :

- **une section** : chaque membre y ouvre un sujet où il liste ses RP de la période. Un membre est à jour s'il est l'auteur d'au moins un sujet ayant le nombre de réponses requis (`reponses`, 1 par défaut) ;
- **un sujet unique** : chaque membre y répond. Un membre est à jour s'il y a posté depuis le début de la période.

Le formulaire propose trois champs : « Activités RP » (section ou sujet), « Archivage » (section) et « Début de la période ». Les deux premiers sont mémorisés dans le navigateur.

### Résultat

- **En danger** : aucun sujet d'activité (mode section) ou aucun message (mode sujet). Deux boutons copient la liste en mentions ou en BBCode.
- **Sujet sans réponse suffisante** (mode section) : le membre a ouvert un sujet, sans le nombre de réponses requis.
- **Absences signalées** : membres ayant ouvert un sujet dans un forum d'`absences` pendant la période.
- **Inscrits pendant la période**.
- **À jour**, avec le lien vers le ou les sujets.
- **Archivage** : la liste des sujets de la section (ou le sujet unique), avec des cases à cocher. Les annonces et post-it sont décochés d'office. Le bouton « Déplacer » demande confirmation.

### Fonctionnement

- Toutes les pages sont lues : la liste de la section, le sujet unique, la liste des membres et les groupes.
- En mode section, seule la liste de la section est lue (auteur et nombre de réponses de chaque sujet), pas les sujets eux-mêmes.
- Les membres sont reconnus par leur numéro de profil, ou par leur pseudo à défaut.
- Le déplacement passe par le formulaire de modération de Forumactif (`/modcp?mode=move`), sujet par sujet. Chaque déplacement est ensuite vérifié dans le fil d'Ariane du sujet.
- Les requêtes sont envoyées deux par deux, avec une courte pause (`simultanes`, `pause`).

### Options

| option | défaut | rôle |
| --- | --- | --- |
| `activites` | `''` | valeur proposée pour « Activités RP » |
| `archive` | `''` | valeur proposée pour « Archivage » |
| `reponses` | `1` | réponses requises dans un sujet d'activité |
| `absences` | `[]` | forums des absences |
| `periode` | `'mois'` | début proposé : le 1er du mois, ou un nombre de jours |
| `membres.groupes` | `[]` | restreindre le recensement à ces groupes |
| `exclure.groupes` | `[]` | groupes ignorés (staff, PNJ, comptes partagés…) |
| `exclure.membres` | `[]` | pseudos ignorés |
| `mention` | `'@"{pseudo}"'` | format des mentions copiées |

### Utilisation sans interface

```js
FAModeration.recenser(config, '/f7-activites-rp', new Date(2026, 8, 1)).then(function (bilan) {
  console.log(bilan.danger.map(function (l) { return l.membre.nom; }));
});
FAModeration.deplacer(['12', '13'], 2, config);
```

## Balisage

Les sélecteurs de lecture des sujets sont réglables (`balisage`) pour les templates modifiés :

| clé | défaut |
| --- | --- |
| `message` | `.post` |
| `auteur` | `.postprofile a[href^="/u"], .postprofile-name a, .postauthor a, .name a` |
| `nomAuteur` | `.postprofile-name, .postprofile .name, .postauthor, .name` |
| `date` | `.topic-date, .post-date, .postdetails, .author` |
| `auteurSujet` | `.topic-author, .topicslist-author, .authorlist, .author` |
| `reponses` | `.posts, .topicslist-replies, .topics-replies` |
| `typeSujet` | `.topic-type, .fal-sujet__type` |

Les dates sont lues dans les formats de Forumactif : « Aujourd'hui à », « Hier à », « Mer 30 Sep 2026 - 16:22 », sans année, `30/09/2026` et `2026-09-30`.
