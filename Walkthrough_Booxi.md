# Walkthrough - Automatisation Réservation Booxi

## 🎯 Objectif Atteint
Le script Node.js/Playwright est désormais capable de :

*   Naviguer vers la page de réservation.
*   Sélectionner le service "COURS PRIVÉ SOLO".
*   Scanner le calendrier pour trouver le prochain Jeudi à l'heure demandée.
*   Remplir automatiquement le formulaire client.
*   Contourner la validation de la politique de confidentialité (Injection JS).
*   Remplir les informations de paiement par carte de crédit (Iframe Square).
*   Confirmer la réservation avec succès.
*   Prendre une photo de preuve (avant et après).

## 🤖 Automatisation (GitHub Actions)
Le script est hébergé sur GitHub.

### Lancement Manuel (Actions)
Vous pouvez lancer le script n'importe quand depuis GitHub :

1.  Allez sur votre dépôt : [https://github.com/gunadeau/fluffy-barnacle/actions](https://github.com/gunadeau/fluffy-barnacle/actions)
2.  Cliquez sur **Booxi Booking**.
3.  Cliquez sur **Run workflow**.
4.  Remplissez les options :
    *   **Dry Run Mode** : `true` (Test) ou `false` (Réel).
    *   **Heure cible** : `18` (Défaut), `17`, `19`, etc.
    *   **Jour cible** : `4` (Défaut = Jeudi). 0=Dim, 1=Lun, 2=Mar, 3=Mer, 5=Ven, 6=Sam.
5.  Cliquez sur le bouton vert **Run workflow**.

### Récupérer les Preuves (Photos)
Après l'exécution du script par GitHub :

1.  Cliquez sur le "Run" (l'exécution) dans la liste.
2.  En bas de page, section **Artifacts**.
3.  Cliquez sur `booking-screenshots` pour télécharger le ZIP des photos.

## 🔐 Configuration (Secrets)
Secrets obligatoires : `USER_FIRST_NAME`, `USER_LAST_NAME`, `USER_EMAIL`, `USER_PHONE`.
**Nouveaux secrets (Paiement Booxi/Square) :**
*   `USER_CC_NUMBER` : Numéro de la carte de crédit
*   `USER_CC_EXPIRY` : Date d'expiration (format MM/AA)
*   `USER_CC_CVV` : Code de sécurité (3 chiffres)
**Secrets optionnels (Facturation) :** `USER_ADDRESS`, `USER_CITY`, `USER_STATE`.
