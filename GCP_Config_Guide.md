# Configuration Google Cloud Scheduler

Voici les valeurs exactes à copier-coller dans la console Google Cloud.

## 1. Informations de base

*   **Nom** : `booxi-booking-trigger`
*   **Région** : (Au choix, ex: `northamerica-northeast1`)
*   **Fréquence** : `2 0-4 * * *`
    *   Cela lancera le script à : 00h02, 01h02, 02h02, 03h02 et 04h02.
*   **Timezone** : `America/Montreal` (ou Eastern Time)

## 2. Configuration de l'exécution

*   **Type de cible** : HTTP
*   **URL** : `https://api.github.com/repos/gunadeau/fluffy-barnacle/actions/workflows/booking.yml/dispatches`
*   **Méthode HTTP** : POST

## 3. Corps (Body)

Copiez ce JSON tel quel :

```json
{
  "ref": "main",
  "inputs": {
    "targetHour": "18",
    "dryRun": "false",
    "targetDay": "4"
  }
}
```

## 4. En-têtes (Headers)

1.  **Nom** : `Authorization`
    *   **Valeur** : `Bearer VOTRE_TOKEN_GITHUB_ICI`
    *   *Remplacez `VOTRE_TOKEN_GITHUB_ICI` par le token que vous allez générer (commençant par `ghp_` ou `github_pat_`).*
2.  **Nom** : `Accept`
    *   **Valeur** : `application/vnd.github.v3+json`
3.  **Nom** : `User-Agent`
    *   **Valeur** : `Google-Cloud-Scheduler`
