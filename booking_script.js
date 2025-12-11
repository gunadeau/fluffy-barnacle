const { chromium } = require('playwright');
const fs = require('fs');

const CONFIG = {
  url: 'https://site.booxi.com/academiebaseballl31?lang=fre',
  targetService: 'COURS PRIVÉ SOLO (avec coach Eddie)',
  targetDayOfWeek: 4, // 0=Dim, 1=Lun, ..., 4=Jeudi, ...
  targetHour: 18,     // 18h (Cible finale)
  targetMinute: 0,
  user: {
    firstName: 'Guillaume',
    lastName: 'Nadeau',
    phone: '418-473-8191',
    email: 'gunadeau@hotmail.com',
    address: '123 Rue Principale', // Adresse
    city: 'Québec',
    zipCode: 'G1G 1G1'
  },
  dryRun: true // ⚠️ MODE DRY-RUN ACTIVÉ ⚠️
};

(async () => {
  console.log('🚀 Démarrage du script de réservation Booxi...');
  if (CONFIG.dryRun) console.log('⚠️ MODE DRY-RUN ACTIVÉ : Aucune réservation ne sera soumise.');

  const browser = await chromium.launch({ headless: false });
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

    // 2. Sélectionner le service
    console.log(`Recherche du service : ${CONFIG.targetService}...`);
    const serviceLocator = page.locator('.uie_vListItem', { hasText: CONFIG.targetService }).first();
    if (await serviceLocator.count() === 0) throw new Error(`Service "${CONFIG.targetService}" introuvable.`);
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

            // Recherche heure 18:00 (Stricte)
            // Regex: Start with 18:00 to avoid partial matches like "17:00 - 18:00"
            const targetTime = `${CONFIG.targetHour}:${CONFIG.targetMinute.toString().padStart(2, '0')}`;
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
      if (!CONFIG.dryRun) await browser.close();
      return;
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

    if (CONFIG.dryRun) {
      console.log('⚠️ DRY-RUN: Fin. (Injection effectuée)');
      const confirmBtn = page.locator('#_bn_bt_next');
      if (await confirmBtn.isVisible()) console.log('✅ Bouton "Confirmer" visible.');
    } else {
      console.log('Validation FINALE (Clic Confirmer)...');
      const confirmBtn = page.locator('#_bn_bt_next');
      await confirmBtn.click();

      // Attente post-clic pour voir si erreur ou succès
      await page.waitForTimeout(5000);

      // Vérifier s'il y a un message d'erreur de politique
      const errorMsg = page.locator('[bx_lang="cancel_policy_check_err"]');
      if (await errorMsg.isVisible()) {
        console.error('❌ ÉCHEC : Le site refuse toujours malgré le hack JS.');
        await page.screenshot({ path: 'failure_hack_js.png' });
      } else {
        console.log('✅ SUCCÈS : Injection JS réussie ! Réservation soumise.');
      }
    }
  } catch (error) {
    console.error('❌ Erreur générale:', error);
    await page.screenshot({ path: 'error_final.png' });
  } finally {
    if (!CONFIG.dryRun) await browser.close();
    else console.log('Navigateur laissé ouvert pour inspection.');
  }
})();
