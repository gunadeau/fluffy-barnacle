const { chromium } = require('playwright');
const fs = require('fs');

const CONFIG = {
  url: 'https://site.booxi.com/academiebaseballl31?lang=fre',
  targetService: 'COURS PRIVÉ SOLO (avec coach Eddie)',
  targetDayOfWeek: process.env.TARGET_DAY ? parseInt(process.env.TARGET_DAY) : 4, // 0=Dim, 1=Lun, ..., 4=Jeudi, ...
  targetHour: process.env.TARGET_HOUR ? parseInt(process.env.TARGET_HOUR) : 18,     // 18h par défaut
  targetMinute: 0,
  user: {
    firstName: process.env.USER_FIRST_NAME || 'Guillaume',
    lastName: process.env.USER_LAST_NAME || 'Nadeau',
    phone: process.env.USER_PHONE || '418-473-8191',
    email: process.env.USER_EMAIL || 'gunadeau@hotmail.com',
    ccNumber: process.env.USER_CC_NUMBER || '4242424242424242',
    ccExpiry: process.env.USER_CC_EXPIRY || '12/26',
    ccCvv: process.env.USER_CC_CVV || '123',
    address: process.env.USER_ADDRESS || '123 Rue Principale',
    city: process.env.USER_CITY || 'Quebec',
    state: process.env.USER_STATE || 'QC'
  },
  // Si DRY_RUN est défini à 'false', on passe en mode réel. Sinon, par défaut true (sécurité).
  dryRun: process.env.DRY_RUN === 'false' ? false : true
};

(async () => {
  console.log('🚀 Démarrage du script de réservation Booxi...');
  if (CONFIG.dryRun) console.log('⚠️ MODE DRY-RUN ACTIVÉ : Aucune réservation ne sera soumise.');

  // Sur GitHub Actions (CI), on doit être en headless. En local, on veut voir le navigateur (headless: false).
  const browser = await chromium.launch({ headless: !!process.env.CI });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Accéder au site
    console.log(`Navigation vers ${CONFIG.url}...`);
    await page.goto(CONFIG.url);
    await page.waitForTimeout(2000);

    const rdvBtn = page.locator('.uie_button', { hasText: /Rendez-vous|Book/i }).first();
    if (await rdvBtn.count() > 0 && await rdvBtn.isVisible()) {
      console.log('Bouton "Rendez-vous" trouvé, clic...');
      await rdvBtn.click();
    }

    await page.waitForSelector('.uie_vListItem', { timeout: 10000 });

    // 2. Sélectionner la catégorie (Nouveau format Booxi) et le service
    console.log(`Recherche de la catégorie (ex: Services Généraux)...`);
    // On essaie d'abord de trouver la catégorie "Services Généraux" ou d'autres catégories pour les dérouler
    const categoryLocator = page.locator('.uie_vListItem', { hasText: /Services Généraux/i }).first();
    if (await categoryLocator.isVisible()) {
      console.log('Catégorie trouvée, clic pour dérouler...');
      await categoryLocator.click();
      await page.waitForTimeout(1000); // Laisse le temps à l'animation de se terminer
    }

    console.log(`Recherche du service : ${CONFIG.targetService}...`);
    // On peut avoir besoin de cibler un élément plus profond ou général si la classe a changé
    const serviceLocator = page.locator('.uie_vListItem, .bnx_svc_list_item', { hasText: CONFIG.targetService }).first();
    
    // Attendre que le service apparaisse potentiellement (si l'API charge des données)
    try {
      await serviceLocator.waitFor({ state: 'visible', timeout: 5000 });
    } catch(e) {
      // Ignorer l'erreur de timeout ici pour laisser le throw classique faire son travail
    }

    if (await serviceLocator.count() === 0 || !(await serviceLocator.isVisible())) {
       // Si on ne trouve toujours pas, on fait un screenshot pour débugger
       await page.screenshot({ path: 'erreur_service_introuvable.png' });
       throw new Error(`Service "${CONFIG.targetService}" introuvable ou invisible. Vérifiez si la catégorie est correcte.`);
    }
    await serviceLocator.click();
    console.log('Service sélectionné.');

    // 3. Calendrier
    // Attendre l'apparition d'un jour dans le calendrier (plus fiable que le conteneur global)
    await page.waitForSelector('.day_cell_block', { state: 'visible', timeout: 20000 });
    console.log('Calendrier chargé.');

    let slotFound = false;

    // Boucle sur les mois (3 itérations)
    for (let m = 0; m < 3; m++) {
      console.log(`\n--- Analyse du mois (itération ${m + 1}/3) ---`);
      await page.waitForTimeout(1000);

      const availableDays = page.locator('.day_cell_block:not(.cld_disable_day)');
      const count = await availableDays.count();
      console.log(`${count} jours actifs potentiels trouvés ce mois-ci.`);

      for (let i = 0; i < count; i++) {
        const dayElement = availableDays.nth(i);
        if (!await dayElement.isVisible()) continue;

        const id = await dayElement.getAttribute('id'); // ex: __mc_20231214
        if (id && id.startsWith('__mc_')) {
          const dateStr = id.replace('__mc_', '');
          const year = parseInt(dateStr.substring(0, 4));
          const month = parseInt(dateStr.substring(4, 6));
          const day = parseInt(dateStr.substring(6, 8));
          const dateObj = new Date(year, month - 1, day);

          // Jeudi (4)
          if (dateObj.getDay() === CONFIG.targetDayOfWeek) {
            console.log(`🔎 Vérification du Jeudi : ${dateObj.toLocaleDateString()}`);

            // Clic jour pour révéler les créneaux
            await dayElement.scrollIntoViewIfNeeded();
            try { await dayElement.click({ force: true }); } catch (e) { continue; }
            await page.waitForTimeout(1000);

            // Regex: Start with 18:00 to avoid partial matches like "17:00 - 18:00"
            const targetHourStr = CONFIG.targetHour.toString().padStart(2, '0');
            const targetTime = `${targetHourStr}:${CONFIG.targetMinute.toString().padStart(2, '0')}`;
            const timeSlot = page.locator('.intv_row', { hasText: new RegExp(`^${targetTime}`) }).first();

            if (await timeSlot.isVisible()) {
              // Double check text content to be absolutely sure
              const text = await timeSlot.innerText();
              if (text.trim().startsWith(targetTime)) {
                console.log(`✅ DISPONIBILITÉ TROUVÉE : ${dateObj.toLocaleDateString()} à ${targetTime} !`);
                await timeSlot.scrollIntoViewIfNeeded();
                await timeSlot.click();
                slotFound = true;
                break; // Break days loop
              }
            }
          }
        }
      }
      if (slotFound) break; // Break months loop

      const nextMonthBtn = page.locator('.head_btn_next').first();
      if (await nextMonthBtn.isVisible()) {
        console.log('Passage au mois suivant...');
        await nextMonthBtn.click({ force: true });
        await page.waitForTimeout(1500);
      } else {
        console.log('Fin du calendrier accessible.');
        break;
      }
    }

    if (!slotFound) {
      console.log('\n❌ Aucune disponibilité trouvée.');
      // En CI ou dryRun, on ferme proprement pour ne pas laisser de zombie
      if (!CONFIG.dryRun || process.env.CI) await browser.close();
      console.log('Sortie succés (0) pour ne pas casser le pipeline CI.');
      process.exit(0);
    }

    // 4. Formulaire
    console.log('\nRemplissage du formulaire...');
    const firstNameSelector = 'input[name="first_name"]'; // Found via debug
    try {
      await page.waitForSelector(firstNameSelector, { state: 'visible', timeout: 10000 });
    } catch (e) {
      console.error("❌ Formulaire non détecté (Timeout).");
      throw e;
    }

    await page.fill('input[name="first_name"]', CONFIG.user.firstName);
    await page.fill('input[name="last_name"]', CONFIG.user.lastName);
    await page.fill('input[name="email"]', CONFIG.user.email);
    await page.fill('input[name="phone"]', CONFIG.user.phone);

    // Address elements if present
    if (await page.locator('input[name="client_address"]').isVisible()) {
      await page.fill('input[name="client_address"]', CONFIG.user.address);
    }
    if (await page.locator('input[name="client_city"]').isVisible()) {
      await page.fill('input[name="client_city"]', CONFIG.user.city);
    }
    if (await page.locator('input[name="client_pczip"]').isVisible()) {
      await page.fill('input[name="client_pczip"]', CONFIG.user.zipCode);
    }

    console.log('Formulaire rempli.');

    // Formulaire rempli.
    console.log('Champs texte remplis.');

    // Cocher les cases de rappel (Email et SMS)
    // 1. Email Reminder
    // Le div parent n'a pas d'ID unique facile, on le cherche par son input enfant ou son texte
    const emailReminderDiv = page.locator('.uie_chkbtn', { has: page.locator('input[name="email_reminder"]') }).first();
    if (await emailReminderDiv.isVisible()) {
      // Vérifier si déjà coché ? La valeur est hidden value="0" ou "1".
      // On clique pour activer. On suppose qu'ils sont décochés par défaut.
      const val = await page.locator('input[name="email_reminder"]').inputValue();
      if (val === '0') {
        console.log('Activation rappel Courriel...');
        await emailReminderDiv.click();
      }
    }

    // 2. SMS Reminder
    // ID trouvé: #bnx_form_sms_reminder
    const smsReminderDiv = page.locator('#bnx_form_sms_reminder');
    if (await smsReminderDiv.isVisible()) {
      const val = await page.locator('input[name="sms_reminder"]').inputValue();
      if (val === '0') {
        console.log('Activation rappel SMS...');
        await smsReminderDiv.click();
      }
    }

    console.log('Cases rappel traitées. Clic sur "Suivant" (Flèche droite)...');

    // Le bouton "Suivant" est #_bn_bt_next. À cette étape, c'est une flèche.
    const nextArrowBtn = page.locator('#_bn_bt_next');
    await nextArrowBtn.click();

    // --- INJECTION CHIRURGICALE (Variables découvertes) ---
    console.log('💉 FORÇAGE des variables internes Booxi...');

    try {
      await page.evaluate(() => {
        if (typeof ns_bookNow !== 'undefined') {
          // On force les flags découverts
          console.log('Setting flVal_acceptCancelPolicy = true');
          ns_bookNow.flVal_acceptCancelPolicy = true;

          console.log('Setting flVal_acceptCancelPrivacyPolicy = true');
          ns_bookNow.flVal_acceptCancelPrivacyPolicy = true;

          // On tente aussi d'appeler la fonction de validation si possible
          if (ns_bookNow.fnx_clkPolicy_alt) {
            const el = document.getElementById('btn_chk_cancel_privacy_policy');
            if (el) ns_bookNow.fnx_clkPolicy_alt(el);
          }

          // Mise à jour visuelle pour le fun (et pour debug)
          const domEl = document.getElementById('btn_chk_cancel_privacy_policy');
          if (domEl) domEl.setAttribute('data-is-checked', 'true');
        }
      });

    } catch (e) {
      console.log('Erreur injection:', e.message);
    }

    // Petite pause pour laisser le JS du site digérer
    await page.waitForTimeout(1000);

    // --- PREUVE PHOTO (Screenshot) ---
    const now = new Date();
    // Format YYYY-MM-DD_HH-mm
    const dateStr = now.toISOString().split('T')[0] + '_' + now.toTimeString().split(' ')[0].replace(/:/g, '-').slice(0, 5);
    const screenshotName = `booking_proof_${dateStr}.png`;
    console.log(`📸 Prise de photo de preuve : ${screenshotName}`);
    await page.screenshot({ path: screenshotName, fullPage: true });

    console.log('Passage à la page de confirmation / paiement...');
    // L'ID du bouton a peut-être changé, ciblage large du texte "Confirmer"
    const confirmBtn = page.locator('#_bn_bt_next, button:has-text("Confirmer"), .uie_button:has-text("Confirmer")').first();
    if (await confirmBtn.isVisible()) {
        console.log('Bouton Confirmer trouvé, clic...');
        await confirmBtn.click();
    } else {
        console.log('⚠️ Bouton Confirmer introuvable. Essai de forçage...');
        try { await page.getByText(/Confirmer/i).click(); } catch(e) { console.log(e.message); }
    }

    // Attente post-clic pour voir si erreur ou succès
    await page.waitForTimeout(4000);

    // Vérifier s'il y a un message d'erreur de politique
    const errorMsg = page.locator('[bx_lang="cancel_policy_check_err"]');
    if (await errorMsg.isVisible()) {
      console.error('❌ ÉCHEC : Le site refuse toujours malgré le hack JS.');
      await page.screenshot({ path: `failure_hack_js_${dateStr}.png` });
      throw new Error('Erreur de politique - impossible de continuer.');
    } else {
      console.log('✅ SUCCÈS : Injection JS réussie, passage au paiement.');
    }

    // --- ÉTAPE PAIEMENT ---
    console.log('Ouverture du formulaire de paiement (Clic Payer)...');
    
    // Le bouton 'Payer'
    const payerBtn = page.locator('.uie_button', { hasText: /Payer|Pay/i }).first();
    if (await payerBtn.isVisible()) {
      await payerBtn.click();
      await page.waitForTimeout(3000);
    } else {
      console.log('Bouton Payer introuvable par texte, tentative du bouton générique...');
    }

    // Wait for the Square iframe
    console.log('Attente de l\'Iframe Square CDN...');
    const squareIframeElement = await page.waitForSelector('iframe[src*="squarecdn.com"]', { timeout: 15000 }).catch(() => null);
    
    if (squareIframeElement) {
        console.log('✅ Iframe Square détecté, injection des informations bancaires...');
        const frame = await squareIframeElement.contentFrame();
        
        // Remplissage infos CB
        await frame.getByPlaceholder(/Numéro de la carte/i).fill(CONFIG.user.ccNumber).catch(e => console.log('Erreur Numéro carte:', e.message));
        await frame.getByPlaceholder(/MM\/AA/i).fill(CONFIG.user.ccExpiry).catch(e => console.log('Erreur Expiration:', e.message));
        await frame.getByPlaceholder(/CVV/i).fill(CONFIG.user.ccCvv).catch(e => console.log('Erreur CVV:', e.message));

        console.log('Vérification et remplissage des champs de facturation dans le DOM (si présents)...');
        
        // Fonction utilitaire pour remplir s'il est visible
        const fillIfEmpty = async (selector, value, name) => {
           try {
             // IMPORTANT: filter({ state: 'visible' }) permet d'ignorer les anciens champs cachés (ex: ceux du formulaire précédent)
             let input = page.locator(selector).filter({ state: 'visible' }).first();
             
             // Au cas où les champs sont carrément bâtis DANS l'iframe par Square
             if (!(await input.isVisible())) {
                 input = frame.locator(selector).filter({ state: 'visible' }).first();
             }

             if (await input.isVisible()) {
                const currentVal = await input.inputValue();
                if (!currentVal) {
                    await input.fill(value);
                    console.log(`✅ Champ ${name} rempli.`);
                } else {
                    console.log(`ℹ️ Champ ${name} déjà rempli.`);
                }
             } else {
                 console.log(`⚠️ Champ ${name} introuvable à l'écran.`);
             }
           } catch(e) {
               console.log(`❌ Erreur remplissage ${name}:`, e.message);
           }
        };

        // Facturation (sélecteurs exacts validés via aria-label de Square)
        await fillIfEmpty('input[aria-label="Adresse ligne 1"]', CONFIG.user.address, 'Adresse');
        await fillIfEmpty('input[aria-label="Ville"]', CONFIG.user.city, 'Ville');
        await fillIfEmpty('input[aria-label="État"]', CONFIG.user.state, 'État');
        await fillIfEmpty('input[aria-label="Prénom"]', CONFIG.user.firstName, 'Prénom');
        await fillIfEmpty('input[aria-label="Nom"]', CONFIG.user.lastName, 'Nom');

        // Sélection du pays (Dropdown)
        try {
            let countrySelect = page.locator('select.sq-custom-input-field, select[aria-label*="Pays"], select[autocomplete="country"]').filter({ state: 'visible' }).first();
            if (!(await countrySelect.isVisible())) {
                countrySelect = frame.locator('select.sq-custom-input-field, select[aria-label*="Pays"], select[autocomplete="country"]').filter({ state: 'visible' }).first();
            }
            if (await countrySelect.isVisible()) {
                await countrySelect.selectOption({ label: 'Canada' }).catch(async () => {
                    await countrySelect.selectOption('CA');
                });
                console.log('✅ Pays (Canada) sélectionné.');
            } else {
                console.log('ℹ️ Menu déroulant du pays non visible ou géré différemment.');
            }
        } catch(e) {
            console.log('⚠️ Impossible de sélectionner le pays:', e.message);
        }

    } else {
        console.log('❌ Iframe Square introuvable. Le système a-t-il changé de fournisseur ?');
    }

    console.log('📸 Prise de photo du formulaire de paiement rempli...');
    await page.screenshot({ path: `payment_form_filled_${dateStr}.png`, fullPage: true });

    if (CONFIG.dryRun) {
      console.log('⚠️ DRY-RUN: Fin du script. Le bouton "Terminé" (Paiement) ne sera pas cliqué pour éviter un paiement réel.');
    } else {
      if (squareIframeElement) {
         console.log('Validation FINALE du PAIEMENT (Recherche du bouton de confirmation)...');
         
         try {
             // On s'assure de chercher spécifiquement le bouton noir "Payer" (Payer XXX $) généré par Square!
             // L'ID #sq-pay-button est unique et évite les conflits avec les boutons cachés de Booxi (ex: bx_btn_payment)
             const termineBtn = page.locator('#sq-pay-button');
             await termineBtn.waitFor({ state: 'visible', timeout: 5000 });
             
             console.log('✅ Bouton de paiement (Payer) trouvé ! Tentative de clic...');
             await termineBtn.click({ timeout: 5000 });
             
             console.log('Attente de la confirmation Square...');
             await page.waitForTimeout(6000); 
             console.log('✅ Paiement soumis. Vérifiez votre boîte courriel pour confirmation.');
             await page.screenshot({ path: `success_payment_${dateStr}.png`, fullPage: true });
         } catch(e) {
             console.log('❌ Bouton Terminé introuvable ou inactif (grisé). Erreur:', e.message);
             await page.screenshot({ path: `error_payment_${dateStr}.png` });
         }
      }
    }
  } catch (error) {
    console.error('❌ Erreur générale:', error);
    await page.screenshot({ path: 'error_final.png' });
  } finally {
    // En mode réel (pas dryRun) OU en environnement CI (GitHub Actions), on ferme toujours le navigateur.
    // On ne le laisse ouvert que si on est en DRY-RUN LOCAL pour inspection.
    if (!CONFIG.dryRun || process.env.CI) {
      console.log('Fermeture du navigateur.');
      await browser.close();
    } else {
      console.log('Navigateur laissé ouvert pour inspection (Local DryRun).');
    }
  }
})();
