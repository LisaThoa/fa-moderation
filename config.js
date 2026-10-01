/* fa-moderation : modèle de configuration. À recopier sur le forum, avant le chargement du plugin.
   Forumactif retire les retours à la ligne des templates : sur le forum, n'utiliser que des
   commentaires en barre-étoile, jamais en double barre. */

window.FA_MODERATION_CONFIG = {
  /* Élément du forum dans lequel les outils s'affichent. position : debut, fin, avant, apres. */
  emplacement: { cible: '#fa-moderation', position: 'fin' },

  /* true : les outils ne sont chargés que pour les administrateurs et les modérateurs. */
  staff: true,

  /* true : le plugin attend un appel à FAModeration.init(config), par exemple à l'ouverture d'un panneau. */
  manuel: false,

  recensement: {
    /* Valeurs proposées dans le formulaire, modifiables à chaque recensement.
       activites : section où chaque membre ouvre son sujet d'activité (« /f7-activites-rp », « 7 »),
       ou sujet unique où chacun répond (« /t12-recensement »). archive : section d'archivage. */
    activites: '/f7-activites-rp',
    archive: '/f2-corbeille',

    /* Mode section : réponses requises dans le sujet d'activité d'un membre. */
    reponses: 1,

    /* Forums des absences : un membre qui y a ouvert un sujet pendant la période est classé à part. */
    absences: [],

    /* Début de la période proposé par défaut : 'mois' (le 1er du mois) ou un nombre de jours. */
    periode: 'mois',

    /* Membres recensés : vide pour tous les membres, sinon des numéros de groupe (/g3-… → 3). */
    membres: { groupes: [] },

    /* Membres à ignorer : groupes (numéros) et pseudos. */
    exclure: { groupes: [], membres: [] },

    /* Format du bouton « Copier les mentions ». {pseudo} et {id} sont remplacés. */
    mention: '@"{pseudo}"'
  }
};
